import { json, nowIso, randomId, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const orderId = String(body.orderId || "");
  const token = String(body.token || "");
  const contentHash = String(body.contentHash || randomId("hash"));
  const cvData = body.cvData || null;

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND token = ?")
    .bind(orderId, token)
    .first();

  if (!order) {
    return json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
  }

  if (order.generated_at) {
    const document = await env.DB.prepare("SELECT * FROM final_documents WHERE order_id = ?")
      .bind(orderId)
      .first();
    if (document) {
      return json({ ok: true, status: "generated", generatedAt: order.generated_at, alreadyGenerated: true });
    }
    return json({ ok: false, error: "El CV final ya fue generado para este pedido" }, { status: 409 });
  }

  if (order.status !== "preview_ready") {
    return json({ ok: false, error: "Orden no habilitada para generación" }, { status: 403 });
  }

  const now = nowIso();
  const update = await env.DB.prepare(
    "UPDATE orders SET status = 'generated', cv_json = ?, generated_at = ?, updated_at = ? WHERE id = ? AND token = ? AND status = 'preview_ready' AND generated_at IS NULL"
  )
    .bind(cvData ? JSON.stringify(cvData) : order.data_json || "{}", now, now, orderId, token)
    .run();

  if (!update.meta || update.meta.changes !== 1) {
    return json({ ok: false, error: "El CV final ya fue generado o la orden no está habilitada." }, { status: 409 });
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO final_documents (id, order_id, content_hash, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(randomId("doc"), orderId, contentHash, now)
    .run();

  return json({ ok: true, status: "generated", generatedAt: now });
}
