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
  return normalized && activeCode && normalized === activeCode;
}
