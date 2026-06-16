export const DEFAULT_PLANS = {
  basic: { id: "basic", name: "Básico", amount: 4990 },
  professional: { id: "professional", name: "Profesional", amount: 8990 },
  focused: { id: "focused", name: "Enfocado", amount: 12990 },
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
      "cache-control": "no-store",
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

// Fuente unica de deteccion de inyeccion de prompts. La usan tanto la
// validacion previa (validate.js) como el saneo del gateway de IA
// (process-cv.js) para que los patrones no diverjan entre si.
export const PROMPT_INJECTION_PATTERNS = [
  /ignor[aá]\s+(lo\s+anterior|todo|todas?\s+las?\s+instrucciones?|las?\s+instrucciones?)/i,
  /olv[ií]date\s+de\s+(todo|las?\s+instrucciones?)/i,
  /invent[aáe]?\b/i,
  /dec[ií]\s+que\s+(soy|fui|tengo|sabe?s?)/i,
  /agreg[aáe]r?\b/i,
  /nueva\s+instrucci[oó]n/i,
  /act[uú]a\s+como/i,
  /\b(system|developer|assistant)\s*:/i,
  /sistem[a]?\s*:/i,
  /prompt\s*:/i,
  /prompt\s+(anterior|del\s+sistema|system)/i,
  /api[_\s-]?key/i,
  /\[INST\]|<\|im_start\|>/i,
  /copiar?\s+(este\s+)?aviso/i,
  /aunque\s+no\s+lo\s+dij/i,
];

export function hasPromptInjection(value) {
  const text = String(value || "");
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeCvData(value) {
  if (Array.isArray(value)) return value.map(sanitizeCvData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeCvData(item)]));
  }
  if (typeof value !== "string") return value;
  const text = value
    .replace(/\borganiz([ée])/gi, "organic$1")
    .replace(/\s+(y|e|o|u)$/i, "")
    .trim();
  if (!hasPromptInjection(text)) return text;
  return text
    .split(/(?<=[.!?])\s+|\n+|;+/)
    .map((part) => part.trim())
    .filter((part) => part && !hasPromptInjection(part))
    .join(". ")
    .replace(/\.{2,}/g, ".")
    .trim();
}
