import { json, nowIso, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let event = {};
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || null;
  const requestId = request.headers.get("x-request-id") || "";
  let signatureOk = false;

  if (env.MP_WEBHOOK_SECRET) {
    signatureOk = await verifyMercadoPagoSignature(request, url, env.MP_WEBHOOK_SECRET);
    if (!signatureOk) {
      await insertMpEvent(env, { paymentId, xRequestId: requestId, signatureValid: 0, processed: 0, error: "INVALID_SIGNATURE" });
      return json({ ok: false, error: "Firma inválida" }, { status: 401 });
    }
  }

  event = await readJson(request);

  const eventType = event.type || event.action || url.searchParams.get("topic") || url.searchParams.get("type") || "";
  paymentId = paymentId || event.data?.id || event.payment_id || event.id || null;

  if (!paymentId || !String(eventType).includes("payment")) {
    await insertMpEvent(env, {
      eventType,
      action: event.action,
      paymentId,
      xRequestId: requestId,
      signatureValid: signatureOk ? 1 : 0,
      processed: 0,
      error: "IGNORED_NON_PAYMENT",
    });
    return json({ ok: true, ignored: true });
  }

  if (!env.MP_ACCESS_TOKEN) {
    return json({ ok: false, error: "MP_ACCESS_TOKEN no configurado" }, { status: 500 });
  }

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    },
  });

  const payment = await paymentResponse.json();

  if (!paymentResponse.ok) {
    return json({ ok: false, error: "No se pudo consultar el pago", detail: payment }, { status: 502 });
  }

  const orderId = payment.external_reference || payment.metadata?.order_id;

  if (!orderId) {
    await insertMpEvent(env, {
      eventType,
      action: event.action,
      paymentId,
      mpStatus: payment.status,
      mpStatusDetail: payment.status_detail,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      xRequestId: requestId,
      signatureValid: signatureOk ? 1 : 0,
      processed: 0,
      error: "NO_ORDER_ID",
    });
    return json({ ok: true, ignored: true });
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(orderId)
    .first();

  if (!order) {
    await insertMpEvent(env, {
      eventType,
      action: event.action,
      paymentId,
      orderId,
      mpStatus: payment.status,
      mpStatusDetail: payment.status_detail,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      xRequestId: requestId,
      signatureValid: signatureOk ? 1 : 0,
      processed: 0,
      error: "ORDER_NOT_FOUND",
    });
    return json({ ok: true, ignored: true });
  }

  if (order.status === "generated") {
    await insertMpEvent(env, {
      eventType,
      action: event.action,
      paymentId,
      orderId,
      mpStatus: payment.status,
      mpStatusDetail: payment.status_detail,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      xRequestId: requestId,
      signatureValid: signatureOk ? 1 : 0,
      processed: 0,
      error: "ALREADY_GENERATED",
    });
    return json({ ok: true, ignored: "already_generated" });
  }

  const now = nowIso();
  const amountOk = Number(payment.transaction_amount) === Number(order.amount);
  const currencyOk = !payment.currency_id || payment.currency_id === "ARS";

  if (payment.status !== "approved" || !amountOk || !currencyOk) {
    const nextStatus = mapPaymentStatus(payment.status, order.status);
    await env.DB.prepare(
      "UPDATE orders SET status = ?, mp_payment_id = ?, mp_status = ?, mp_currency = ?, last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
    )
      .bind(nextStatus, String(paymentId), payment.status || null, payment.currency_id || null, now, now, orderId)
      .run();
    await insertMpEvent(env, {
      eventType,
      action: event.action,
      paymentId,
      orderId,
      mpStatus: payment.status,
      mpStatusDetail: payment.status_detail,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      xRequestId: requestId,
      signatureValid: signatureOk ? 1 : 0,
      processed: 0,
      error: !amountOk || !currencyOk ? "VALIDATION_FAILED" : null,
    });
    return json({ ok: true, status: payment.status, ignored: true });
  }

  await env.DB.prepare(
    "UPDATE orders SET status = 'paid', mp_payment_id = ?, mp_status = ?, mp_currency = ?, paid_at = COALESCE(paid_at, ?), last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(String(paymentId), payment.status || "approved", payment.currency_id || "ARS", now, now, now, orderId)
    .run();

  await insertMpEvent(env, {
    eventType,
    action: event.action,
    paymentId,
    orderId,
    mpStatus: payment.status,
    mpStatusDetail: payment.status_detail,
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    xRequestId: requestId,
    signatureValid: signatureOk ? 1 : 0,
    processed: 1,
  });

  return json({ ok: true });
}

function mapPaymentStatus(mpStatus, currentStatus) {
  if (currentStatus === "generated") return "generated";
  if (["pending", "in_process", "authorized", "in_mediation"].includes(mpStatus)) return "payment_pending";
  if (mpStatus === "rejected") return "payment_rejected";
  if (mpStatus === "cancelled") return "payment_cancelled";
  if (mpStatus === "refunded") return "refunded";
  if (mpStatus === "charged_back") return "charged_back";
  return currentStatus || "payment_pending";
}

async function verifyMercadoPagoSignature(request, url, secret) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const dataId = (url.searchParams.get("data.id") || "").toLowerCase();
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=").map((value) => value.trim())));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !requestId || !dataId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(signatureBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, v1);
}

async function insertMpEvent(env, event = {}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mp_events (
        id, event_type, action, payment_id, order_id, mp_status, mp_status_detail,
        amount, currency, x_request_id, signature_valid, processed, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        event.eventType || null,
        event.action || null,
        event.paymentId ? String(event.paymentId) : null,
        event.orderId || null,
        event.mpStatus || null,
        event.mpStatusDetail || null,
        event.amount == null ? null : Math.round(Number(event.amount)),
        event.currency || null,
        event.xRequestId || null,
        event.signatureValid ? 1 : 0,
        event.processed ? 1 : 0,
        event.error || null,
        nowIso()
      )
      .run();
  } catch {
    // La auditoría de eventos no debe bloquear la conciliación del pago.
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
