// Middleware de Pages: aplica CSP por-request con nonce a las respuestas HTML.
// Esto permite quitar 'unsafe-inline' de script-src sin tener que externalizar
// todos los <script> inline. El resto de headers de seguridad sigue en _headers.

const CONNECT_SRC = [
  "'self'",
  "https://api.groq.com",
  "https://generativelanguage.googleapis.com",
  "https://api.openai.com",
  "https://api.mercadopago.com",
].join(" ");

/**
 * @param {string} nonce
 * @returns {string}
 */
function buildCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${CONNECT_SRC}`,
    "form-action 'self' https://formsubmit.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const original = await response.text();
  // Añade el nonce a cada etiqueta <script ...> (inline y con src).
  const html = original.replace(/<script(\s|>)/g, `<script nonce="${nonce}"$1`);

  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildCsp(nonce));
  headers.delete("content-length");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
