import { json, nowIso, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const event = await readJson(request);

  // Placeholder: en producción validar x-signature, consultar payment_id en Mercado Pago
  // y comparar external_reference, monto, moneda y estado aprobado antes de marcar pago.
  const orderId = event.external_reference || event.data?.external_reference;
  const paymentId = event.data?.id || event.payment_id || null;

  if (!orderId) {
    return json({ ok: true, ignored: true });
  }

  const now = nowIso();
  await env.DB.prepare(
    "UPDATE orders SET status = 'paid', mp_payment_id = ?, paid_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(paymentId, now, now, orderId)
    .run();

  return json({ ok: true });
}
