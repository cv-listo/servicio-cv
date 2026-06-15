import { checkRateLimit, clientIp, json, nowIso, readJson, sanitizeCvData } from "../../_utils.js";
import { validateData } from "../../validate.js";

export async function onRequestPost({ request, params, env }) {
  const body = await readJson(request);
  const token = String(body.token || "");
  const data = sanitizeCvData(body.data || {});
  const isDraft = Boolean(body.draft);
  const rate = await checkRateLimit(env, `profile:${clientIp(request)}:${params.id}`, 20, 600);
  if (!rate.ok) {
    return json({ ok: false, error: "Demasiadas actualizaciones. Probá nuevamente en unos minutos." }, { status: 429 });
  }

  if (JSON.stringify(data).length > 60000) {
    return json({ ok: false, error: "El formulario es demasiado extenso" }, { status: 413 });
  }

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
  const reports = isDraft ? [] : validateData(data, order.plan_id);
  const hasCritical = reports.some((report) => report.severity === "critical");
  if (!isDraft && hasCritical) {
    return json({ ok: false, error: "El formulario tiene errores obligatorios.", reports }, { status: 422 });
  }
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
