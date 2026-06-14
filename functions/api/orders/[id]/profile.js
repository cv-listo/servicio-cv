import { json, nowIso, readJson } from "../../_utils.js";

export async function onRequestPost({ request, params, env }) {
  const body = await readJson(request);
  const token = String(body.token || "");
  const data = body.data || {};
  const reports = body.reports || [];
  const isDraft = Boolean(body.draft);

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND token = ?")
    .bind(params.id, token)
    .first();

  if (!order) {
    return json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
  }

  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "El enlace del pedido expiró" }, { status: 410 });
  }

  if (!["paid", "discount_test", "form_started", "preview_ready"].includes(order.status)) {
    return json({ ok: false, error: "Orden no habilitada para formulario" }, { status: 403 });
  }

  const now = nowIso();
  const nextStatus = isDraft ? "form_started" : "preview_ready";
  await env.DB.prepare(
    "UPDATE orders SET status = ?, data_json = ?, updated_at = ? WHERE id = ?"
  )
    .bind(nextStatus, JSON.stringify(data), now, params.id)
    .run();

  await env.DB.prepare("DELETE FROM order_audits WHERE order_id = ?")
    .bind(params.id)
    .run();

  for (const report of reports) {
    await env.DB.prepare(
      "INSERT INTO order_audits (order_id, rule_id, severity, message, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(params.id, report.ruleId || "CLIENT_VALIDATION", report.severity || "INFO", report.message || "", now)
      .run();
  }

  return json({ ok: true, status: nextStatus });
}
