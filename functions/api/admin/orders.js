import { json, isAdmin } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const plan = url.searchParams.get("plan") || "";
  const email = url.searchParams.get("email") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

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
     LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all();

  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`)
    .bind(...params)
    .first();

  return json({ ok: true, orders: orders.results || [], total: Number(count?.total || 0), limit, offset });
}
