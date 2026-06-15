export const DEFAULT_PLANS = {
  basic: { id: "basic", name: "Básico", amount: 9999 },
  professional: { id: "professional", name: "Profesional", amount: 19999 },
  focused: { id: "focused", name: "Enfocado", amount: 29999 },
};

export const PLANS = DEFAULT_PLANS;

export function getPlans(env = {}) {
  return {
    basic: withEnvAmount(DEFAULT_PLANS.basic, env.PLAN_BASIC_AMOUNT),
    professional: withEnvAmount(DEFAULT_PLANS.professional, env.PLAN_PROFESSIONAL_AMOUNT),
    focused: withEnvAmount(DEFAULT_PLANS.focused, env.PLAN_FOCUSED_AMOUNT),
  };
}

export function getPlan(env, planId) {
  return getPlans(env)[planId] || getPlans(env).basic;
}

export function formatPrice(amount) {
  return `$${Number(amount || 0).toLocaleString("es-AR")}`;
}

function withEnvAmount(plan, rawAmount) {
  const amount = Number(String(rawAmount || "").replace(/[^\d]/g, ""));
  return { ...plan, amount: Number.isFinite(amount) && amount > 0 ? amount : plan.amount };
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function isTestCodeEnabled(env, code) {
  const normalized = String(code || "").trim().toUpperCase();
  const activeCode = String(env.TEST_DISCOUNT_CODE || "").trim().toUpperCase();
  if (activeCode === "TEST" && env.ALLOW_TEST_CODE !== "true") {
    return false;
  }
  return normalized && activeCode && normalized === activeCode;
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
}

export async function checkRateLimit(env, key, limit = 10, windowSeconds = 300) {
  if (!env.DB || !key) return { ok: true };
  const now = Date.now();
  const current = await env.DB.prepare("SELECT * FROM rate_limits WHERE key = ?")
    .bind(key)
    .first();
  if (!current || new Date(current.reset_at).getTime() <= now) {
    const resetAt = new Date(now + windowSeconds * 1000).toISOString();
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)")
      .bind(key, resetAt)
      .run();
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (Number(current.count) >= limit) {
    return { ok: false, remaining: 0, resetAt: current.reset_at };
  }
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();
  return { ok: true, remaining: limit - Number(current.count) - 1, resetAt: current.reset_at };
}
