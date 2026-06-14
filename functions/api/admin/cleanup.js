import { json, nowIso } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(Number(url.searchParams.get("days") || 7), 90));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = nowIso();

  const result = await env.DB.prepare(
    `UPDATE orders
     SET status = 'payment_cancelled', updated_at = ?
     WHERE status = 'payment_pending'
       AND paid_at IS NULL
       AND created_at < ?`
  )
    .bind(now, cutoff)
    .run();

  return json({
    ok: true,
    status: "payment_cancelled",
    cutoff,
    changed: result.meta?.changes || 0,
  });
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
