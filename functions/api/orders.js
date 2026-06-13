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

  if (env.MP_ACCESS_TOKEN) {
    const origin = new URL(request.url).origin;
    const preferencePayload = {
      items: [
        {
          id: plan.id,
          title: `CV Listo - Plan ${plan.name}`,
          quantity: 1,
          unit_price: plan.amount,
          currency_id: "ARS",
        },
      ],
      external_reference: id,
      notification_url: `${origin}/api/webhook-mp`,
      back_urls: {
        success: `${origin}/pago.html?order=${id}&token=${token}`,
        failure: `${origin}/confirmar.html?plan=${plan.id}`,
        pending: `${origin}/pago.html?order=${id}&token=${token}`,
      },
      auto_return: "approved",
      metadata: {
        order_id: id,
        plan_id: plan.id,
      },
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(preferencePayload),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return json(
        { ok: false, error: "No se pudo crear la preferencia de Mercado Pago", detail: mpData },
        { status: 502 }
      );
    }

    await env.DB.prepare(
      "UPDATE orders SET mp_preference_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(mpData.id || null, nowIso(), id)
      .run();

    return json({
      ok: true,
      orderId: id,
      token,
      status,
      redirectUrl: mpData.init_point || mpData.sandbox_init_point,
      preferenceId: mpData.id,
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
