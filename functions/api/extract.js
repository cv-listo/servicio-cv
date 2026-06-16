import { checkRateLimit, clientIp, json } from "./_utils.js";

// Solo planes con IA pueden subir archivos. Se valida server-side contra la orden.
const FILE_UPLOAD_PLANS = new Set(["professional", "focused"]);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const MAX_TOTAL_TEXT_CHARS = 16000;
const MAX_FILES = 5;
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
  const files = form.getAll("file");

  if (!orderId || !token) {
    return json({ ok: false, error: "Faltan datos del pedido." }, { status: 400 });
  }
  if (!files.length) {
    return json({ ok: false, error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return json({ ok: false, error: `Podés subir hasta ${MAX_FILES} archivos por vez.` }, { status: 400 });
  }
  if (files.some((file) => !file || typeof file === "string" || typeof file.arrayBuffer !== "function")) {
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
  if (!FILE_UPLOAD_PLANS.has(order.plan_id || "")) {
    return json({ ok: false, error: "La subida de archivos está disponible solo en planes con IA." }, { status: 403 });
  }

  const results = [];
  for (const file of files) {
    results.push(await extractOneFile(file, env));
  }

  const readable = results.filter((item) => item.ok);
  const combinedText = readable
    .map((item) => `Archivo: ${item.name}\n${item.text}`)
    .join("\n\n")
    .slice(0, MAX_TOTAL_TEXT_CHARS);

  if (!readable.length) {
    return json({ ok: false, error: "No se pudo leer texto utilizable en los archivos.", files: results }, { status: 422 });
  }

  return json({
    ok: true,
    files: results,
    totalChars: combinedText.length,
    text: combinedText,
    note: "Texto extraído. Revisalo y editá lo que quieras antes de generar el CV.",
  });
}

async function extractOneFile(file, env) {
  const name = file.name || "archivo";
  try {
    if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      return { ok: false, name, error: "El archivo supera el tamaño máximo de 4 MB.", reason: "archivo_grande" };
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return { ok: false, name, error: "El archivo supera el tamaño máximo de 4 MB.", reason: "archivo_grande" };
    }
    if (buffer.byteLength === 0) {
      return { ok: false, name, error: "El archivo está vacío.", reason: "archivo_vacio" };
    }

    const bytes = new Uint8Array(buffer);
    const kind = detectFileType(bytes);
    let text = "";
    if (kind === "pdf") {
      text = await extractPdfText(bytes);
      if (text.trim().length < MIN_TEXT_FOR_PDF) {
        return { ok: false, name, kind, error: "El PDF parece ser una imagen escaneada y no tiene texto seleccionable.", reason: "pdf_sin_texto" };
      }
    } else if (kind === "docx") {
      text = await extractDocxText(bytes);
    } else {
      return { ok: false, name, error: "Formato no soportado. Subí PDF con texto o Word (.docx).", reason: "formato_no_soportado" };
    }

    const cleaned = normalizeExtracted(text).slice(0, MAX_TEXT_CHARS);
    if (cleaned.trim().length < 10) {
      return { ok: false, name, kind, error: "No se encontró texto utilizable en el archivo.", reason: "sin_texto" };
    }
    return { ok: true, name, kind, chars: cleaned.length, text: cleaned.slice(0, MAX_TEXT_CHARS) };
  } catch (error) {
    return {
      ok: false,
      name,
      error: "No se pudo leer el contenido del archivo.",
      detail: env.DEBUG_EXTRACT === "true" ? String(error?.message || error) : undefined,
      reason: "error_lectura",
    };
  }
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
  const pdfjs = await import("pdfjs-serverless");
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items));
    }
  } finally {
    await pdf.destroy?.();
  }
  return pages.join("\n");
}

// pdf.js entrega el texto en fragmentos con su posición (transform) y ancho.
// Unir todo con un espacio fijo parte palabras ("grandes" -> "gran des").
// Acá decidimos el separador según el hueco real entre fragmentos: si están
// pegados no metemos espacio, si hay salto de línea ponemos \n.
function joinTextItems(items) {
  let text = "";
  let prevEndX = null;
  let prevY = null;
  for (const item of items) {
    const str = item.str || "";
    if (!str) {
      if (item.hasEOL) {
        text += "\n";
        prevEndX = null;
        prevY = null;
      }
      continue;
    }
    const transform = Array.isArray(item.transform) ? item.transform : null;
    const x = transform ? transform[4] : null;
    const y = transform ? transform[5] : null;
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 10;

    if (prevY !== null && y !== null && Math.abs(y - prevY) > height * 0.6) {
      text += "\n";
    } else if (prevEndX !== null && x !== null) {
      const gap = x - prevEndX;
      // Umbral ~25% del alto de fuente: huecos menores son la misma palabra.
      text += gap > height * 0.25 ? " " : "";
    } else if (text && !/\s$/.test(text)) {
      text += " ";
    }

    text += str;
    prevEndX = x !== null ? x + width : null;
    prevY = y;
  }
  return text;
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
