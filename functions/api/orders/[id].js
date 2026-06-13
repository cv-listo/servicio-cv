import { json } from "../_utils.js";

export async function onRequestGet({ request, params, env }) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND token = ?")
    .bind(params.id, token)
    .first();

  if (!order) {
    return json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
  }
  const { token: _token, ...safeOrder } = order;

  return json({
    ok: true,
    order: {
      ...safeOrder,
      data_json: order.data_json ? JSON.parse(order.data_json) : {},
      cv_json: order.cv_json ? JSON.parse(order.cv_json) : {},
      display_flags: order.display_flags ? JSON.parse(order.display_flags) : {},
    },
  });
}
