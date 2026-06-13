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
  return Object.fromEntries(new FormData(form).entries());
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

  return `
    <article class="cv-page">
      <header class="cv-header">
        <h1>${normalizeText(data.fullName) || "Nombre Apellido"}</h1>
        <p>${contact || "Datos de contacto"}</p>
      </header>
      <section>
        <h2>Perfil</h2>
        <p>${normalizeText(data.summary) || `Perfil orientado a ${normalizeText(data.targetRole) || "nuevas oportunidades laborales"}.`}</p>
      </section>
      <section>
        <h2>Experiencia</h2>
        <p>${normalizeText(data.experience) || "Experiencia a completar."}</p>
      </section>
      <section>
        <h2>Educación</h2>
        <p>${normalizeText(data.education) || "Educación a completar."}</p>
      </section>
      <section>
        <h2>Habilidades</h2>
        <p>${normalizeText(data.skills) || "Habilidades a completar."}</p>
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
  renderPlanSummary,
  collectFormData,
  validateResumeData,
  buildResumeHtml,
};
