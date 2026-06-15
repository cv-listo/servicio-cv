import { checkRateLimit, clientIp, json, nowIso, readJson } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const orderId = String(body.orderId || "");
  const token = String(body.token || "");
  const rate = await checkRateLimit(env, `payments-check:${clientIp(request)}:${orderId}`, 8, 600);
  if (!rate.ok) {
    return json({ ok: false, error: "Demasiadas consultas de pago. Probá nuevamente en unos minutos." }, { status: 429 });
  }

  if (!orderId || !token) {
    return json({ ok: false, error: "Datos insuficientes" }, { status: 400 });
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND token = ?")
    .bind(orderId, token)
    .first();

  if (!order) {
    return json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
  }

  if (["paid", "form_started", "preview_ready", "generated"].includes(order.status)) {
    return json({ ok: true, status: order.status, alreadyEnabled: true });
  }

  if (!env.MP_ACCESS_TOKEN) {
    return json({ ok: true, status: order.status, message: "Mercado Pago no configurado." });
  }

  const payment = order.mp_payment_id
    ? await fetchPayment(env, order.mp_payment_id)
    : await findPaymentByExternalReference(env, order.id);

  if (!payment) {
    return json({ ok: true, status: order.status, message: "Todavía no encontramos un pago confirmado para esta orden." });
  }

  const now = nowIso();
  const amountOk = Number(payment.transaction_amount) === Number(order.amount);
  const currencyOk = !payment.currency_id || payment.currency_id === "ARS";
  const nextStatus = mapPaymentStatus(payment.status, order.status);

  if (payment.status === "approved" && amountOk && currencyOk) {
    await env.DB.prepare(
      "UPDATE orders SET status = 'paid', mp_payment_id = ?, mp_status = ?, mp_currency = ?, paid_at = COALESCE(paid_at, ?), last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
    )
      .bind(String(payment.id), payment.status, payment.currency_id || "ARS", now, now, now, order.id)
      .run();

    await insertMpEvent(env, {
      paymentId: payment.id,
      orderId: order.id,
      mpStatus: payment.status,
      mpStatusDetail: payment.status_detail,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      processed: 1,
      error: "MANUAL_CHECK_PROCESSED",
    });

    return json({ ok: true, status: "paid", paymentId: String(payment.id), reconciled: true });
  }

  await env.DB.prepare(
    "UPDATE orders SET status = ?, mp_payment_id = ?, mp_status = ?, mp_currency = ?, last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(nextStatus, String(payment.id), payment.status || null, payment.currency_id || null, now, now, order.id)
    .run();

  await insertMpEvent(env, {
    paymentId: payment.id,
    orderId: order.id,
    mpStatus: payment.status,
    mpStatusDetail: payment.status_detail,
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    processed: 0,
    error: !amountOk || !currencyOk ? "MANUAL_CHECK_VALIDATION_FAILED" : "MANUAL_CHECK_NOT_APPROVED",
  });

  return json({ ok: true, status: nextStatus, paymentId: String(payment.id), reconciled: false });
}

async function fetchPayment(env, paymentId) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function findPaymentByExternalReference(env, orderId) {
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", orderId);
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.results?.[0] || null;
}

function mapPaymentStatus(mpStatus, currentStatus) {
  if (currentStatus === "generated") return "generated";
  if (mpStatus === "approved") return "paid";
  if (["pending", "in_process", "authorized", "in_mediation"].includes(mpStatus)) return "payment_pending";
  if (mpStatus === "rejected") return "payment_rejected";
  if (mpStatus === "cancelled") return "payment_cancelled";
  if (mpStatus === "refunded") return "refunded";
  if (mpStatus === "charged_back") return "charged_back";
  return currentStatus || "payment_pending";
}

async function insertMpEvent(env, event = {}) {
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mp_events (
        id, event_type, action, payment_id, order_id, mp_status, mp_status_detail,
        amount, currency, x_request_id, signature_valid, processed, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        "payment",
        "manual.check",
        event.paymentId ? String(event.paymentId) : null,
        event.orderId || null,
        event.mpStatus || null,
        event.mpStatusDetail || null,
        event.amount == null ? null : Math.round(Number(event.amount)),
        event.currency || null,
        null,
        0,
        event.processed ? 1 : 0,
        event.error || null,
        nowIso()
      )
      .run();
  } catch {
    // El log manual no debe bloquear la conciliacion.
  }
}
