import { json } from "../_utils.js";

export async function onRequestGet({ params, env }) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(params.id)
    .first();

  if (!order) {
    return json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
  }

  return json({ ok: true, order });
}
