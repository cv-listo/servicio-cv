import { checkRateLimit, clientIp, json, readJson } from "./_utils.js";

function clean(value) {
  return String(value || "").trim();
}

function hasPromptInjection(value) {
  return [
    /ignor[aá]\s+(todas?\s+)?(las?\s+)?instrucciones?/i,
    /olv[ií]date\s+de\s+(todo|las?\s+instrucciones?)/i,
    /invent[aáe]\s+que/i,
    /dec[ií]\s+que\s+(soy|fui|tengo|sabe?s?)/i,
    /agrega[r]?\s+que/i,
    /nueva\s+instrucci[oó]n/i,
    /act[uú]a\s+como/i,
    /\b(system|developer|assistant|prompt|api[_\s-]?key)\s*:/i,
    /\[INST\]|<\|im_start\|>/i,
  ].some((pattern) => pattern.test(String(value || "")));
}

function hasUnsafePromptText(value) {
  if (Array.isArray(value)) return value.some(hasUnsafePromptText);
  if (value && typeof value === "object") return Object.values(value).some(hasUnsafePromptText);
  return typeof value === "string" && hasPromptInjection(value);
}

export function validateData(data, planId) {
  const reports = [];

  if (!clean(data.fullName)) {
    reports.push({ severity: "critical", message: "El nombre completo es obligatorio." });
  }

  if (hasUnsafePromptText(data)) {
    reports.push({ severity: "critical", message: "Detectamos instrucciones no válidas dentro de campos del CV. Eliminá ese texto antes de generar." });
  }

  if (!clean(data.email) && !clean(data.phone)) {
    reports.push({ severity: "critical", message: "Incluí al menos un email o teléfono de contacto." });
  }

  if (!clean(data.targetRole)) {
    reports.push({ severity: "warning", message: "Conviene indicar el puesto o rubro objetivo." });
  }

  const hasExperience = clean(data.informalExperience) || (data.experiences || []).some((item) => clean(item.tasks) || clean(item.role) || clean(item.place));
  const hasEducation = (data.educationItems || []).some((item) => clean(item.text));
  const hasSkills = clean(data.skills);

  if (!hasExperience && !hasEducation && !hasSkills) {
    reports.push({ severity: "critical", message: "Cargá experiencia, estudios o habilidades para generar el CV." });
  }

  for (const item of data.experiences || []) {
    if (clean(item.startYear) && clean(item.endYear) && item.isCurrent !== "on") {
      const start = Number(item.startYear) * 12 + Number(item.startMonth || 1);
      const end = Number(item.endYear) * 12 + Number(item.endMonth || 12);
      if (start > end) {
        reports.push({ severity: "critical", message: `Fechas inconsistentes en ${item.place || item.role || "una experiencia"}.` });
      }
    }
  }

  if (planId === "focused" && !clean(data.jobAd)) {
    reports.push({ severity: "critical", message: "El plan Enfocado requiere el texto o resumen del aviso laboral." });
  }

  if (clean(data.summary).length > 650) {
    reports.push({ severity: "warning", message: "El perfil es largo. Conviene resumirlo para que entre mejor en A4." });
  }

  if (clean(data.skills).split(/\n|,|;/).filter(Boolean).length > 14) {
    reports.push({ severity: "warning", message: "Hay muchas habilidades. Conviene dejar las más relevantes." });
  }

  return reports;
}

export async function onRequestPost({ request, env }) {
  const rate = await checkRateLimit(env, `validate:${clientIp(request)}`, 30, 300);
  if (!rate.ok) {
    return json({ ok: false, error: "Demasiadas validaciones. Probá nuevamente en unos minutos." }, { status: 429 });
  }
  const body = await readJson(request);
  if (JSON.stringify(body.data || {}).length > 60000) {
    return json({ ok: false, isValid: false, reports: [{ severity: "critical", message: "El formulario es demasiado extenso." }] }, { status: 413 });
  }
  const reports = validateData(body.data || {}, body.planId || "basic");
  const isValid = !reports.some((report) => report.severity === "critical");
  return json({ ok: true, isValid, reports });
}
