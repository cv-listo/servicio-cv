import { json } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const plan = url.searchParams.get("plan") || "";
  const email = url.searchParams.get("email") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 200);

  const filters = [];
  const params = [];
  if (status) {
    filters.push("status = ?");
    params.push(status);
  }
  if (plan) {
    filters.push("plan_id = ?");
    params.push(plan);
  }
  if (email) {
    filters.push("lower(email) LIKE ?");
    params.push(`%${email.toLowerCase()}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const orders = await env.DB.prepare(
    `SELECT id, email, plan_id, amount, currency, status, mp_payment_id, mp_status,
            paid_at, generated_at, created_at, updated_at
     FROM orders
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(...params, limit)
    .all();

  return json({ ok: true, orders: orders.results || [] });
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
