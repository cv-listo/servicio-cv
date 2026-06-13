import { json, nowIso, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (env.MP_WEBHOOK_SECRET) {
    const signatureOk = await verifyMercadoPagoSignature(request, url, env.MP_WEBHOOK_SECRET);
    if (!signatureOk) {
      return json({ ok: false, error: "Firma inválida" }, { status: 401 });
    }
  }

  const event = await readJson(request);

  const eventType = event.type || event.action || "";
  const paymentId = event.data?.id || event.payment_id || event.id || url.searchParams.get("data.id") || null;

  if (!paymentId || !String(eventType).includes("payment")) {
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
    return json({ ok: true, ignored: true });
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(orderId)
    .first();

  if (!order) {
    return json({ ok: true, ignored: true });
  }

  if (order.status === "generated") {
    return json({ ok: true, ignored: "already_generated" });
  }

  const now = nowIso();
  const amountOk = Number(payment.transaction_amount) === Number(order.amount);
  const currencyOk = !payment.currency_id || payment.currency_id === "ARS";

  if (payment.status !== "approved" || !amountOk || !currencyOk) {
    await env.DB.prepare(
      "UPDATE orders SET mp_payment_id = ?, mp_status = ?, mp_currency = ?, last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
    )
      .bind(String(paymentId), payment.status || null, payment.currency_id || null, now, now, orderId)
      .run();
    return json({ ok: true, status: payment.status, ignored: true });
  }

  await env.DB.prepare(
    "UPDATE orders SET status = 'paid', mp_payment_id = ?, mp_status = ?, mp_currency = ?, paid_at = COALESCE(paid_at, ?), last_payment_checked_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(String(paymentId), payment.status || "approved", payment.currency_id || "ARS", now, now, now, orderId)
    .run();

  return json({ ok: true });
}

async function verifyMercadoPagoSignature(request, url, secret) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const dataId = url.searchParams.get("data.id") || "";
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

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
