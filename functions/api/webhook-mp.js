import { json, nowIso, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const event = await readJson(request);

  const eventType = event.type || event.action || "";
  const paymentId = event.data?.id || event.payment_id || event.id || null;

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

  if (payment.status !== "approved" || Number(payment.transaction_amount) !== Number(order.amount)) {
    return json({ ok: true, status: payment.status, ignored: true });
  }

  const now = nowIso();
  await env.DB.prepare(
    "UPDATE orders SET status = 'paid', mp_payment_id = ?, paid_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(String(paymentId), now, now, orderId)
    .run();

  return json({ ok: true });
}
