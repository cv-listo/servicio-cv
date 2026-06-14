import { json } from "./_utils.js";
import { sendEmail } from "./_email.js";

const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  if (String(form.get("_honey") || "")) {
    return json({ ok: true });
  }

  const email = String(form.get("email") || "").trim();
  const orderId = String(form.get("order_id") || "").trim();
  const detail = String(form.get("detalle") || "").trim();
  const file = form.get("comprobante");

  if (!email || !detail) {
    return json({ ok: false, error: "Email y detalle son obligatorios." }, { status: 400 });
  }

  const attachments = [];
  if (file && typeof file === "object" && file.size) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_ATTACHMENT_SIZE) {
      return json({ ok: false, error: "El comprobante debe ser PDF, JPG o PNG de hasta 2 MB." }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    attachments.push({
      filename: file.name || "comprobante",
      content: arrayBufferToBase64(buffer),
    });
  }

  const result = await sendEmail(env, {
    to: env.SUPPORT_EMAIL || "soporte@cvlisto.com.ar",
    subject: "Soporte CV Listo",
    html: `
      <h2>Solicitud de soporte CV Listo</h2>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Pedido:</strong> ${escapeHtml(orderId || "No informado")}</p>
      <p><strong>Detalle:</strong></p>
      <p>${escapeHtml(detail).replaceAll("\n", "<br>")}</p>
      <p><strong>Adjunto:</strong> ${attachments.length ? "Incluido" : "No incluido"}</p>
    `,
    attachments,
  });

  if (!result.ok) {
    return json({ ok: false, error: "No se pudo enviar el soporte." }, { status: 502 });
  }

  return json({ ok: true, message: "Solicitud enviada." });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
