import { json, nowIso, readJson, isAdmin } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const body = await readJson(request);
  const orderId = String(body.orderId || "");
  const message = String(body.message || "").trim();

  if (!orderId || !message) {
    return json({ ok: false, error: "Pedido y nota son obligatorios" }, { status: 400 });
  }

  if (message.length > 1200) {
    return json({ ok: false, error: "La nota es demasiado extensa" }, { status: 413 });
  }

  const order = await env.DB.prepare("SELECT id FROM orders WHERE id = ?")
    .bind(orderId)
    .first();

  if (!order) {
    return json({ ok: false, error: "Pedido no encontrado" }, { status: 404 });
  }

  await env.DB.prepare(
    "INSERT INTO order_audits (order_id, rule_id, severity, message, created_at) VALUES (?, 'ADMIN_NOTE', 'info', ?, ?)"
  )
    .bind(orderId, message, nowIso())
    .run();

  return json({ ok: true });
}
