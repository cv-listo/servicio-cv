// Middleware de Pages: aplica CSP por-request con nonce a las respuestas HTML.
// Esto permite quitar 'unsafe-inline' de script-src sin tener que externalizar
// todos los <script> inline. El resto de headers de seguridad sigue en _headers.

// Como pages_build_output_dir = ".", toda la raíz del repo se publica como
// estático. Estos archivos son código fuente / documentación / configuración
// interna y no deben servirse por URL directa, así que los respondemos con 404.
const PROTECTED_EXTENSIONS = [".md", ".sql", ".toml", ".lock", ".example"];
const PROTECTED_FILES = new Set([
  "/package.json",
  "/package-lock.json",
  "/tsconfig.json",
  "/.gitignore",
  "/.gitattributes",
]);
const PROTECTED_PREFIXES = ["/tests/", "/node_modules/", "/.git"];

/**
 * Indica si una ruta corresponde a un archivo interno que no debe servirse.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isProtectedAssetPath(pathname) {
  const path = String(pathname || "").toLowerCase();
  // Recursos públicos estándar (verificaciones de dominio, etc.) sí se sirven.
  if (path.startsWith("/.well-known/")) return false;
  // Deny-by-default de dotfiles: cubre secretos y config local aunque por error
  // terminen en el deploy (.env, .dev.vars, .npmrc, .gitignore, .git/...).
  const lastSegment = path.split("/").pop() || "";
  if (lastSegment.startsWith(".")) return true;
  if (PROTECTED_FILES.has(path)) return true;
  if (PROTECTED_EXTENSIONS.some((ext) => path.endsWith(ext))) return true;
  if (PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return false;
}

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
  if (isProtectedAssetPath(new URL(context.request.url).pathname)) {
    return new Response("Not found", { status: 404 });
  }

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
