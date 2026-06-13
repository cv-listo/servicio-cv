import { json } from "./_utils.js";

export async function onRequestGet({ request, env }) {
  if (env.RECOVERY_BY_EMAIL_ENABLED !== "true") {
    return json(
      { ok: false, error: "La recuperación por email requiere configurar envío de correo transaccional." },
      { status: 501 }
    );
  }

  const email = new URL(request.url).searchParams.get("email") || "";
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return json({ ok: false, error: "Email requerido" }, { status: 400 });
  }

  const order = await env.DB.prepare(
    `SELECT * FROM orders
     WHERE lower(email) = ?
       AND status IN ('paid', 'discount_test', 'form_started', 'preview_ready', 'generated')
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(normalizedEmail)
    .first();

  if (!order) {
    return json({ ok: false, error: "No se encontró un pedido activo para ese email" }, { status: 404 });
  }

  return json({
    ok: true,
    order: {
      ...order,
      data_json: order.data_json ? JSON.parse(order.data_json) : {},
      cv_json: order.cv_json ? JSON.parse(order.cv_json) : {},
      display_flags: order.display_flags ? JSON.parse(order.display_flags) : {},
    },
  });
}
