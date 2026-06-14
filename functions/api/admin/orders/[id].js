import { json } from "../../_utils.js";

export async function onRequestGet({ request, params, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(params.id)
    .first();

  if (!order) {
    return json({ ok: false, error: "Pedido no encontrado" }, { status: 404 });
  }

  const events = await env.DB.prepare(
    "SELECT * FROM mp_events WHERE order_id = ? OR payment_id = ? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(order.id, order.mp_payment_id || "")
    .all();

  const audits = await env.DB.prepare(
    "SELECT * FROM order_audits WHERE order_id = ? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(order.id)
    .all();

  const ai = await env.DB.prepare(
    "SELECT * FROM ai_generations WHERE order_id = ? ORDER BY created_at DESC LIMIT 20"
  )
    .bind(order.id)
    .all();

  const docs = await env.DB.prepare(
    "SELECT * FROM final_documents WHERE order_id = ? ORDER BY created_at DESC LIMIT 5"
  )
    .bind(order.id)
    .all();

  return json({
    ok: true,
    order: {
      ...order,
      data_json: parseJson(order.data_json, {}),
      cv_json: parseJson(order.cv_json, {}),
      display_flags: parseJson(order.display_flags, {}),
    },
    links: buildLinks(new URL(request.url).origin, order),
    mp_events: events.results || [],
    audits: audits.results || [],
    ai_generations: (ai.results || []).map((row) => ({
      ...row,
      output_json: parseJson(row.output_json, null),
      warnings_json: parseJson(row.warnings_json, []),
      audit_json: parseJson(row.audit_json, {}),
    })),
    final_documents: docs.results || [],
  });
}

function buildLinks(origin, order) {
  return {
    formulario: `${origin}/formulario.html?order=${order.id}&token=${order.token}`,
    preview: `${origin}/preview.html?order=${order.id}&token=${order.token}`,
    descarga: `${origin}/descargar.html?order=${order.id}&token=${order.token}`,
  };
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function isAdmin(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const basic = auth.startsWith("Basic ") ? decodeBasic(auth.slice(6)) : null;
  const tokenOk = Boolean(env.ADMIN_TOKEN && (token === env.ADMIN_TOKEN || bearer === env.ADMIN_TOKEN));
  const passwordOk = Boolean(env.ADMIN_USER && env.ADMIN_PASSWORD && basic?.user === env.ADMIN_USER && basic?.password === env.ADMIN_PASSWORD);
  return tokenOk || passwordOk;
}

function decodeBasic(value) {
  try {
    const [user, ...passwordParts] = atob(value).split(":");
    return { user, password: passwordParts.join(":") };
  } catch {
    return null;
  }
}
