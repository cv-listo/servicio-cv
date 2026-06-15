import { checkRateLimit, clientIp, getPlan, isTestCodeEnabled, json, nowIso, randomId, readJson } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const plan = getPlan(env, body.planId);
  const email = String(body.email || "").trim();
  const discountCode = String(body.discountCode || "").trim();
  const rate = await checkRateLimit(env, `orders:${clientIp(request)}:${email.toLowerCase()}`, 5, 600);
  if (!rate.ok) {
    return json({ ok: false, error: "Demasiados intentos. Probá nuevamente en unos minutos." }, { status: 429 });
  }
  const id = randomId("order");
  const token = randomId("token");
  const now = nowIso();

  const isTest = isTestCodeEnabled(env, discountCode);
  const status = isTest ? "discount_test" : "created";
  const amount = isTest ? 0 : plan.amount;
  const storedDiscountCode = isTest ? discountCode.toUpperCase() : null;

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
      storedDiscountCode,
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
    const origin = getBaseUrl(env, request);
    const preferencePayload = {
      items: [
        {
          id: plan.id,
          title: `CV Listo - Plan ${plan.name}`,
          description: "Generación digital de CV profesional con vista previa editable",
          quantity: 1,
          unit_price: plan.amount,
          currency_id: "ARS",
        },
      ],
      payer: {
        email,
      },
      external_reference: id,
      notification_url: `${origin}/api/webhook-mp?source_news=webhooks`,
      back_urls: {
        success: `${origin}/pago.html?order=${id}&token=${token}`,
        failure: `${origin}/confirmar.html?plan=${plan.id}`,
        pending: `${origin}/pago.html?order=${id}&token=${token}`,
      },
      auto_return: "approved",
      statement_descriptor: "CV LISTO",
      metadata: {
        order_id: id,
        plan_id: plan.id,
        product: "cv_listo",
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
      "UPDATE orders SET status = 'payment_pending', mp_preference_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(mpData.id || null, nowIso(), id)
      .run();

    return json({
      ok: true,
      orderId: id,
      token,
      status: "payment_pending",
      redirectUrl: selectCheckoutUrl(env, mpData),
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

function getBaseUrl(env, request) {
  return String(env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function selectCheckoutUrl(env, preference) {
  const token = String(env.MP_ACCESS_TOKEN || "");
  if (token.startsWith("TEST-") && preference.sandbox_init_point) {
    return preference.sandbox_init_point;
  }
  return preference.init_point || preference.sandbox_init_point;
}
