export const PLANS = {
  basic: { id: "basic", name: "Básico", amount: 9999 },
  professional: { id: "professional", name: "Profesional", amount: 19999 },
  focused: { id: "focused", name: "Enfocado", amount: 29999 },
};

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
