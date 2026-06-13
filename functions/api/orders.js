import { PLANS, isTestCodeEnabled, json, nowIso, randomId, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const plan = PLANS[body.planId] || PLANS.basic;
  const email = String(body.email || "").trim();
  const discountCode = String(body.discountCode || "").trim();
  const id = randomId("order");
  const token = randomId("token");
  const now = nowIso();

  const isTest = isTestCodeEnabled(env, discountCode);
  const status = isTest ? "discount_test" : "payment_pending";
  const amount = isTest ? 0 : plan.amount;

  await env.DB.prepare(
    `INSERT INTO orders (
      id, token, email, plan_id, amount, currency, status, discount_code,
      external_reference, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, 'ARS', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      token,
      email,
      plan.id,
      amount,
      status,
      isTest ? "TEST" : null,
      id,
      now,
      now,
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
    )
    .run();

  if (isTest) {
    return json({
      ok: true,
      orderId: id,
      token,
      status,
      redirectUrl: `/formulario.html?order=${id}&token=${token}`,
    });
  }

  return json({
    ok: true,
    orderId: id,
    token,
    status,
    message: "Mercado Pago Checkout Pro pendiente de configuración.",
  });
}
