import { json } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const email = url.searchParams.get("email") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 200);

  const filters = [];
  const params = [];
  if (status) {
    filters.push("status = ?");
    params.push(status);
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
  const token = new URL(request.url).searchParams.get("token") || "";
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(env.ADMIN_TOKEN && (token === env.ADMIN_TOKEN || bearer === env.ADMIN_TOKEN));
}
