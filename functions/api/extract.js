import { checkRateLimit, clientIp, json } from "./_utils.js";

// Solo el plan Enfocado puede subir archivos. Se valida server-side contra la orden.
const FOCUSED_PLAN = "focused";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const MIN_TEXT_FOR_PDF = 40;

export async function onRequestPost({ request, env }) {
  const rate = await checkRateLimit(env, `extract:${clientIp(request)}`, 10, 600);
  if (!rate.ok) {
    return json({ ok: false, error: "Demasiadas subidas. Probá nuevamente en unos minutos." }, { status: 429 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }

  const orderId = String(form.get("orderId") || "");
  const token = String(form.get("token") || "");
  const file = form.get("file");

  if (!orderId || !token) {
    return json({ ok: false, error: "Faltan datos del pedido." }, { status: 400 });
  }
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return json({ ok: false, error: "No se recibió ningún archivo válido." }, { status: 400 });
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND token = ?")
    .bind(orderId, token)
    .first();

  if (!order || !["paid", "discount_test", "form_started", "preview_ready"].includes(order.status)) {
    return json({ ok: false, error: "Pedido no habilitado." }, { status: 403 });
  }
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "El enlace del pedido expiró." }, { status: 410 });
  }
  if ((order.plan_id || "") !== FOCUSED_PLAN) {
    return json({ ok: false, error: "La subida de archivos está disponible solo en el plan Enfocado." }, { status: 403 });
  }

  if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
    return json({ ok: false, error: "El archivo supera el tamaño máximo de 4 MB." }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return json({ ok: false, error: "El archivo supera el tamaño máximo de 4 MB." }, { status: 413 });
  }
  if (buffer.byteLength === 0) {
    return json({ ok: false, error: "El archivo está vacío." }, { status: 400 });
  }

  const bytes = new Uint8Array(buffer);
  const kind = detectFileType(bytes);

  let text = "";
  try {
    if (kind === "pdf") {
      text = await extractPdfText(bytes);
      if (text.trim().length < MIN_TEXT_FOR_PDF) {
        return json({
          ok: false,
          error: "El PDF parece ser una imagen escaneada y no tiene texto seleccionable. Subí un PDF con texto real o un Word, o completá los datos a mano.",
          reason: "pdf_sin_texto",
        }, { status: 422 });
      }
    } else if (kind === "docx") {
      text = await extractDocxText(bytes);
    } else {
      return json({
        ok: false,
        error: "Formato no soportado. Subí un PDF con texto o un documento Word (.docx).",
        reason: "formato_no_soportado",
      }, { status: 415 });
    }
  } catch {
    return json({ ok: false, error: "No se pudo leer el contenido del archivo. Probá con otro o completá los datos a mano." }, { status: 422 });
  }

  const cleaned = normalizeExtracted(text).slice(0, MAX_TEXT_CHARS);
  if (cleaned.trim().length < 10) {
    return json({ ok: false, error: "No se encontró texto utilizable en el archivo." }, { status: 422 });
  }

  return json({
    ok: true,
    kind,
    chars: cleaned.length,
    text: cleaned,
    note: "Texto extraído. Revisalo y editá lo que quieras antes de generar el CV.",
  });
}

function detectFileType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "docx";
  }
  return "desconocido";
}

async function extractPdfText(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

async function extractDocxText(bytes) {
  const docXmlBytes = await readZipEntry(bytes, "word/document.xml");
  if (!docXmlBytes) throw new Error("no document.xml");
  const xml = new TextDecoder("utf-8").decode(docXmlBytes);
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const lines = paragraphs.map((p) => {
    const withTabs = p
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<w:br\b[^>]*\/?>/g, "\n");
    const runs = withTabs.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    return runs
      .map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, ""))
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  });
  if (!lines.length) {
    const runs = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    return runs.map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, "")).join(" ");
  }
  return lines.join("\n");
}

async function readZipEntry(bytes, targetName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip invalido");
  const cdCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");

  for (let n = 0; n < cdCount; n++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    if (name === targetName) {
      const lhNameLen = view.getUint16(localOffset + 26, true);
      const lhExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return comp;
      if (method === 8) return await inflateRaw(comp);
      throw new Error("metodo de compresion no soportado");
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function inflateRaw(compBytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Response(compBytes).body.pipeThrough(ds);
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

function normalizeExtracted(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .trim();
}
