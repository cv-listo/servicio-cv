import { json, nowIso, readJson } from "../_utils.js";

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

function isAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  const basic = auth.startsWith("Basic ") ? decodeBasic(auth.slice(6)) : null;
  return Boolean(env.ADMIN_USER && env.ADMIN_PASSWORD && basic?.user === env.ADMIN_USER && basic?.password === env.ADMIN_PASSWORD);
}

function decodeBasic(value) {
  try {
    const [user, ...passwordParts] = atob(value).split(":");
    return { user, password: passwordParts.join(":") };
  } catch {
    return null;
  }
}
