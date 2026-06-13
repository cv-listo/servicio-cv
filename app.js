const PLANS = {
  basic: {
    id: "basic",
    name: "Básico",
    price: "$10.000",
    amount: 10000,
    includes: ["CV A4 simple", "PDF", "Sin IA avanzada", "Una generación final"],
  },
  professional: {
    id: "professional",
    name: "Profesional",
    price: "$20.000",
    amount: 20000,
    includes: ["Mejora de redacción", "PDF + DOCX", "Vista previa editable", "Una generación final"],
  },
  focused: {
    id: "focused",
    name: "Enfocado",
    price: "$30.000",
    amount: 30000,
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
    planId: order.planId || order.plan_id,
    status: order.status,
    generated: Boolean(order.generated || order.generated_at),
    createdAt: order.createdAt || order.created_at,
    generatedAt: order.generatedAt || order.generated_at || null,
    data: order.data || order.data_json || {},
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

async function finalizeBackendOrder(id, token, contentHash) {
  const response = await fetch("/api/generate-final", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: id, token, contentHash }),
  });
  if (!response.ok) throw new Error("Backend finalize unavailable");
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
    <div class="app-card">
      <p class="plan-label">${plan.name}</p>
      <h2>${plan.price}</h2>
      <ul class="check-list">
        ${plan.includes.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </div>
  `;
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
  if (!normalizeText(data.experience) && !normalizeText(data.education) && !normalizeText(data.skills)) {
    reports.push({ severity: "critical", message: "Cargá experiencia, estudios o habilidades para generar el CV." });
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

function buildResumeHtml(data) {
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

  const target = normalizeText(data.targetRole);
  const company = normalizeText(data.targetCompany);
  const experienceText = normalizeText(data.experience) || [data.experienceRole, data.experiencePlace]
    .map(normalizeText)
    .filter(Boolean)
    .join(" - ");
  const educationText = normalizeText(data.education) || [data.educationLevel, data.educationStatus]
    .map(normalizeText)
    .filter(Boolean)
    .join(" - ");
  const profileFallback = target
    ? `Perfil orientado a ${target}${company ? ` en ${company}` : ""}.`
    : "Perfil orientado a nuevas oportunidades laborales.";

  return `
    <article class="cv-page">
      <header class="cv-header">
        <h1>${escapeHtml(data.fullName) || "Nombre Apellido"}</h1>
        <p>${escapeHtml(contact) || "Datos de contacto"}</p>
      </header>
      <section>
        <h2>Perfil</h2>
        <p>${formatMultiline(data.summary) || escapeHtml(profileFallback)}</p>
      </section>
      <section>
        <h2>Experiencia</h2>
        <p>${formatMultiline(experienceText) || "Experiencia a completar."}</p>
      </section>
      <section>
        <h2>Educación</h2>
        <p>${formatMultiline(educationText) || "Educación a completar."}</p>
      </section>
      <section>
        <h2>Habilidades</h2>
        <p>${formatMultiline(data.skills) || "Habilidades a completar."}</p>
      </section>
    </article>
  `;
}

window.CVListo = {
  PLANS,
  getParam,
  createOrder,
  getOrder,
  updateOrder,
  cacheOrder,
  fetchBackendOrder,
  saveBackendProfile,
  finalizeBackendOrder,
  renderPlanSummary,
  collectFormData,
  validateResumeData,
  buildResumeHtml,
  escapeHtml,
  sha256,
};
