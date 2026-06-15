const PLANS = {
  basic: {
    id: "basic",
    name: "Básico",
    price: "$9.999",
    amount: 9999,
    includes: ["CV A4 simple", "PDF", "Sin IA avanzada", "Una generación final"],
  },
  professional: {
    id: "professional",
    name: "Profesional",
    price: "$19.999",
    amount: 19999,
    includes: ["Mejora de redacción", "PDF A4", "Vista previa editable", "Una generación final"],
  },
  focused: {
    id: "focused",
    name: "Enfocado",
    price: "$29.999",
    amount: 29999,
    includes: ["Puesto y empresa objetivo", "Aviso laboral", "Versión ATS-friendly", "Una generación final"],
  },
};

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getOrders() {
  return JSON.parse(localStorage.getItem("cvListoOrders") || "{}");
}

function saveOrders(orders) {
  localStorage.setItem("cvListoOrders", JSON.stringify(orders));
}

function createOrder(planId, status = "created") {
  const plan = PLANS[planId] || PLANS.basic;
  const id = `order_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const token = Math.random().toString(36).slice(2);
  const orders = getOrders();
  orders[id] = {
    id,
    token,
    planId: plan.id,
    status,
    generated: false,
    createdAt: new Date().toISOString(),
    data: {},
  };
  saveOrders(orders);
  return orders[id];
}

function getOrder(id) {
  return getOrders()[id] || null;
}

function updateOrder(id, patch) {
  const orders = getOrders();
  orders[id] = { ...orders[id], ...patch, updatedAt: new Date().toISOString() };
  saveOrders(orders);
  return orders[id];
}

function cacheOrder(order) {
  const orders = getOrders();
  const cached = {
    id: order.id,
    token: order.token,
    email: order.email || null,
    planId: order.planId || order.plan_id,
    status: order.status,
    generated: Boolean(order.generated || order.generated_at),
    createdAt: order.createdAt || order.created_at,
    generatedAt: order.generatedAt || order.generated_at || null,
    data: order.data || order.data_json || {},
    cvData: order.cvData || order.cv_json || {},
    reports: order.reports || [],
  };
  orders[cached.id] = cached;
  saveOrders(orders);
  return cached;
}

async function fetchBackendOrder(id, token) {
  const response = await fetch(`/api/orders/${id}?token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error("Backend order unavailable");
  const result = await response.json();
  return { ...result.order, token };
}

async function recoverBackendOrder(email) {
  const response = await fetch(`/api/recover?email=${encodeURIComponent(email)}`);
  if (!response.ok) throw new Error("Backend recovery unavailable");
  const result = await response.json();
  return result.order;
}

async function saveBackendProfile(id, token, data, reports) {
  const response = await fetch(`/api/orders/${id}/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, data, reports }),
  });
  if (!response.ok) throw new Error("Backend profile save unavailable");
  return response.json();
}

async function saveBackendDraft(id, token, data) {
  const response = await fetch(`/api/orders/${id}/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, data, reports: [], draft: true }),
  });
  if (!response.ok) throw new Error("Backend draft save unavailable");
  return response.json();
}

async function finalizeBackendOrder(id, token, contentHash, cvData = null) {
  const response = await fetch("/api/generate-final", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: id, token, contentHash, cvData }),
  });
  if (!response.ok) throw new Error("Backend finalize unavailable");
  return response.json();
}

async function validateBackendProfile(planId, data) {
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, data }),
  });
  if (!response.ok) throw new Error("Backend validation unavailable");
  return response.json();
}

async function processBackendAiDraft(id, token, data) {
  const response = await fetch("/api/ai/process-cv", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: id, token, data }),
  });
  if (!response.ok) throw new Error("AI draft unavailable");
  return response.json();
}

async function sha256(value) {
  const buffer = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function renderPlanSummary(container, planId) {
  const plan = PLANS[planId] || PLANS.basic;
  container.innerHTML = `
    <div class="app-card plan-summary-card">
      <p class="plan-label">${plan.name}</p>
      <h2>${plan.price}</h2>
      <ul class="check-list">
        ${plan.includes.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <div class="plan-summary-note">Una única generación · Revisá antes de descargar</div>
      <div class="guarantee-badge">Si no generaste el CV todavía, podés solicitar reembolso por soporte</div>
    </div>
  `;
}

async function loadBackendPlans() {
  const response = await fetch("/api/plans");
  if (!response.ok) throw new Error("Plans unavailable");
  const result = await response.json();
  if (!result.ok || !result.plans) throw new Error("Invalid plans response");
  Object.entries(result.plans).forEach(([key, plan]) => {
    PLANS[key] = { ...PLANS[key], ...plan };
  });
  return PLANS;
}

function hydratePlanPrices(root = document) {
  root.querySelectorAll("[data-plan-price]").forEach((element) => {
    const plan = PLANS[element.dataset.planPrice];
    if (plan?.price) element.textContent = plan.price;
  });
  root.querySelectorAll("[data-plan-amount]").forEach((element) => {
    const plan = PLANS[element.dataset.planAmount];
    if (plan?.amount) element.textContent = plan.amount;
  });
}

function normalizeText(value) {
  return (value || "").trim();
}

function collectFormData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    if (!data[checkbox.name]) {
      data[checkbox.name] = "";
    }
  });
  data.experiences = Array.from(form.querySelectorAll('[data-repeat="experience"]')).map((card) => ({
    place: normalizeText(card.querySelector('[name="experiencePlace"]')?.value),
    role: normalizeText(card.querySelector('[name="experienceRole"]')?.value),
    startMonth: normalizeText(card.querySelector('[name="startMonth"]')?.value),
    startYear: normalizeText(card.querySelector('[name="startYear"]')?.value),
    endMonth: normalizeText(card.querySelector('[name="endMonth"]')?.value),
    endYear: normalizeText(card.querySelector('[name="endYear"]')?.value),
    isCurrent: card.querySelector('[name="isCurrent"]')?.checked ? "on" : "",
    tasks: normalizeText(card.querySelector('[name="experience"]')?.value),
  })).filter((item) => item.place || item.role || item.tasks);
  data.educationItems = Array.from(form.querySelectorAll('[data-repeat="education"]')).map((card) => ({
    text: normalizeText(card.querySelector('[name="education"]')?.value),
  })).filter((item) => item.text);
  return data;
}

function validateResumeData(data, planId) {
  const reports = [];
  if (!normalizeText(data.fullName)) {
    reports.push({ severity: "critical", message: "El nombre completo es obligatorio." });
  }
  if (!normalizeText(data.email) && !normalizeText(data.phone)) {
    reports.push({ severity: "critical", message: "Incluí al menos un email o teléfono de contacto." });
  }
  if (!normalizeText(data.targetRole)) {
    reports.push({ severity: "warning", message: "Conviene indicar el puesto o rubro objetivo." });
  }
  const hasExperience = normalizeText(data.experience) || normalizeText(data.informalExperience) || (data.experiences || []).some((item) => item.tasks || item.role || item.place);
  const hasEducation = normalizeText(data.education) || (data.educationItems || []).some((item) => item.text);
  if (!hasExperience && !hasEducation && !normalizeText(data.skills)) {
    reports.push({ severity: "critical", message: "Cargá experiencia, estudios o habilidades para generar el CV." });
  }
  if (normalizeText(data.startYear) && normalizeText(data.endYear) && !data.isCurrent) {
    const start = Number(data.startYear) * 12 + Number(data.startMonth || 1);
    const end = Number(data.endYear) * 12 + Number(data.endMonth || 12);
    if (start > end) {
      reports.push({ severity: "critical", message: "La fecha de inicio de la experiencia no puede ser posterior a la fecha de fin." });
    }
  }
  if (!hasExperience && data.experienceType !== "none") {
    reports.push({ severity: "warning", message: "La experiencia quedó breve. Agregar tareas ayuda a mejorar el CV." });
  }
  if (!normalizeText(data.skills)) {
    reports.push({ severity: "warning", message: "Agregar habilidades mejora la lectura del CV." });
  }
  if (planId === "focused" && !normalizeText(data.jobAd)) {
    reports.push({ severity: "critical", message: "El plan Enfocado requiere el texto o resumen del aviso laboral." });
  }
  return reports;
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMultiline(value) {
  return escapeHtml(value).replace(/\n+/g, "<br />");
}

function splitItems(value) {
  return normalizeText(value)
    .replace(/\s+(?=(Cobraba|Realizaba|Acomodaba|Limpiaba|Atendía|Atencion|Atención|Ayudaba|Manejo|Reposición|Reposicion|Limpieza|Organización|Organizacion|Elaboración|Elaboracion|Evaluación|Evaluacion|Investigación|Investigacion|Dictado)\b)/g, "\n")
    .split(/\n|;|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function polishCvText(value) {
  const dictionary = [
    [/\bgondolas\b/gi, "góndolas"],
    [/\bgondola\b/gi, "góndola"],
    [/\bposnet\b/gi, "Posnet"],
    [/\bwhatsapp\b/gi, "WhatsApp"],
    [/\bexcel\b/gi, "Excel"],
    [/\batendia\b/gi, "atendía"],
  ];
  return dictionary.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), normalizeText(value));
}

function sentenceCase(value) {
  const text = polishCvText(value);
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1);
}

function renderBullets(items) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(sentenceCase(item))}</li>`).join("")}</ul>`;
}

function meaningfulOption(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return /^indistint[oa]$/i.test(text) ? "" : text;
}

function formatDateRange(data) {
  const start = [data.startMonth, data.startYear].map(normalizeText).filter(Boolean).join("/");
  const end = data.isCurrent === "on" ? "Actualidad" : [data.endMonth, data.endYear].map(normalizeText).filter(Boolean).join("/");
  if (!start && !end) return "";
  return [start, end].filter(Boolean).join(" - ");
}

function formatExperienceDateRange(item) {
  const start = [item.startMonth, item.startYear].map(normalizeText).filter(Boolean).join("/");
  const end = item.isCurrent === "on" ? "Actualidad" : [item.endMonth, item.endYear].map(normalizeText).filter(Boolean).join("/");
  return [start, end].filter(Boolean).join(" - ");
}

function renderExperiences(data) {
  if (normalizeText(data.informalExperience) && data.experienceType !== "formal") {
    return `
      <div class="cv-entry">
        <p><strong>Experiencia práctica y actividades</strong></p>
        ${renderBullets(splitItems(data.informalExperience)) || `<p>${formatMultiline(data.informalExperience)}</p>`}
      </div>
    `;
  }
  const items = data.experiences?.length ? data.experiences : [{
    place: data.experiencePlace,
    role: data.experienceRole,
    startMonth: data.startMonth,
    startYear: data.startYear,
    endMonth: data.endMonth,
    endYear: data.endYear,
    isCurrent: data.isCurrent,
    tasks: data.experience,
  }];
  const rendered = items
    .filter((item) => normalizeText(item.place) || normalizeText(item.role) || normalizeText(item.tasks))
    .map((item) => {
      const title = [item.role, item.place].map(normalizeText).filter(Boolean).join(" · ");
      const range = formatExperienceDateRange(item);
      return `
        <div class="cv-entry">
          ${title ? `<p><strong>${escapeHtml(sentenceCase(title))}</strong>${range ? ` · ${escapeHtml(range)}` : ""}</p>` : ""}
          ${renderBullets(splitItems(item.tasks)) || ""}
        </div>
      `;
    })
    .join("");
  return rendered;
}

function renderEducation(data) {
  const items = data.educationItems?.length ? data.educationItems : [{ text: data.education }];
  const rendered = items
    .filter((item) => normalizeText(item.text))
    .map((item) => `<p>${formatMultiline(item.text)}</p>`)
    .join("");
  return rendered;
}

function buildResumeHtml(data) {
  const template = data.template === "visual" ? "visual" : "ats";
  const contact = [
    data.showEmail === "on" ? data.email : "",
    data.showPhone === "on" ? data.phone : "",
    data.showDni === "on" ? data.dni : "",
    data.showAddress === "on" ? data.address : "",
    data.linkedin,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" · ");

  const target = polishCvText(data.targetRole);
  const company = normalizeText(data.targetCompany);
  const educationText = normalizeText(data.education) || [data.educationLevel, data.educationStatus]
    .map(polishCvText)
    .filter(Boolean)
    .join(" - ");
  const skills = splitItems(data.skills);
  const profileFallback = target
    ? `Perfil orientado a ${target}${company ? ` en ${company}` : ""}.`
    : "Perfil orientado a nuevas oportunidades laborales.";
  const objectiveDetails = [
    data.targetArea ? `Área: ${polishCvText(data.targetArea)}` : "",
    target ? `Puesto objetivo: ${target}` : "",
    meaningfulOption(data.modality) ? `Modalidad: ${meaningfulOption(data.modality)}` : "",
    meaningfulOption(data.availability) ? `Disponibilidad: ${meaningfulOption(data.availability)}` : "",
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" | ");
  // Las secciones vacías no se imprimen para evitar placeholders dentro del CV final.
  const experienceHtml = renderExperiences(data);
  const educationHtml = renderEducation({ ...data, education: educationText });
  const skillsHtml = renderBullets(skills);

  return `
    <article class="cv-page cv-page-polished cv-page-${template}">
      <header class="cv-header">
        <h1>${escapeHtml(data.fullName) || "Nombre Apellido"}</h1>
        ${target ? `<p class="cv-headline">${escapeHtml(sentenceCase(target))}</p>` : ""}
        <p class="cv-contact-line">${escapeHtml(contact) || "Datos de contacto"}</p>
      </header>
      <section class="cv-section">
        <h2>Perfil</h2>
        <p>${formatMultiline(polishCvText(data.summary)) || escapeHtml(profileFallback)}</p>
      </section>
      ${objectiveDetails ? `<section class="cv-section"><h2>Objetivo</h2><p>${escapeHtml(objectiveDetails)}</p></section>` : ""}
      ${experienceHtml ? `<section class="cv-section">
        <h2>Experiencia</h2>
        ${experienceHtml}
      </section>` : ""}
      ${educationHtml ? `<section class="cv-section">
        <h2>Educación</h2>
        ${educationHtml}
      </section>` : ""}
      ${skillsHtml ? `<section class="cv-section">
        <h2>Habilidades</h2>
        ${skillsHtml}
      </section>` : ""}
      ${normalizeText(data.jobAd) ? `<section class="cv-section"><h2>Enfoque del puesto</h2><p>${formatMultiline(data.jobAd)}</p></section>` : ""}
    </article>
  `;
}

window.CVListo = {
  PLANS,
  getParam,
  getOrders,
  createOrder,
  getOrder,
  updateOrder,
  cacheOrder,
  fetchBackendOrder,
  recoverBackendOrder,
  saveBackendProfile,
  saveBackendDraft,
  finalizeBackendOrder,
  validateBackendProfile,
  processBackendAiDraft,
  loadBackendPlans,
  hydratePlanPrices,
  renderPlanSummary,
  collectFormData,
  validateResumeData,
  buildResumeHtml,
  escapeHtml,
  sha256,
};
