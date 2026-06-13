import { json } from "./_utils.js";
import { sendEmail } from "./_email.js";

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

  const origin = new URL(request.url).origin;
  const path = order.status === "generated"
    ? `/descargar.html?order=${order.id}&token=${order.token}`
    : order.status === "preview_ready"
      ? `/preview.html?order=${order.id}&token=${order.token}`
      : `/formulario.html?order=${order.id}&token=${order.token}`;
  const link = `${origin}${path}`;

  const emailResult = await sendEmail(env, {
    to: normalizedEmail,
    subject: "Retomar pedido en CV Listo",
    html: `
      <p>Recibimos una solicitud para retomar un pedido en CV Listo.</p>
      <p><a href="${link}">Continuar pedido</a></p>
      <p>Si no solicitaste este enlace, podés ignorar este mensaje.</p>
    `,
  });

  if (!emailResult.ok) {
    return json({ ok: false, error: "No se pudo enviar el email de recuperación", detail: emailResult }, { status: 500 });
  }

  return json({ ok: true, message: "Si existe un pedido activo, se envió un enlace de recuperación al email indicado." });
}
