import { describe, it, expect } from "vitest";
import {
  detectFileType,
  normalizeExtracted,
  joinTextItems,
} from "../functions/api/extract.js";

function bytesOf(...values) {
  return new Uint8Array(values);
}

// Construye un item al estilo pdf.js: posición en transform[4]=x, [5]=y.
function item(str, x, y, width, { height = 10, hasEOL = false } = {}) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height, hasEOL };
}

describe("detectFileType", () => {
  it("reconoce el magic number de PDF", () => {
    expect(detectFileType(bytesOf(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("reconoce el magic number de ZIP/DOCX", () => {
    expect(detectFileType(bytesOf(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe("docx");
  });

  it("devuelve desconocido para otros bytes o entradas cortas", () => {
    expect(detectFileType(bytesOf(0x00, 0x01, 0x02, 0x03))).toBe("desconocido");
    expect(detectFileType(bytesOf(0x25, 0x50))).toBe("desconocido");
  });
});

describe("normalizeExtracted", () => {
  it("normaliza saltos de línea y colapsa espacios", () => {
    expect(normalizeExtracted("a\r\nb")).toBe("a\nb");
    expect(normalizeExtracted("hola    mundo")).toBe("hola mundo");
  });

  it("limita líneas en blanco consecutivas a una", () => {
    expect(normalizeExtracted("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("recorta espacios al final de línea y bordes", () => {
    expect(normalizeExtracted("linea   \nx")).toBe("linea\nx");
    expect(normalizeExtracted("   hola   ")).toBe("hola");
  });
});

describe("joinTextItems (reconstrucción de texto de pdf.js)", () => {
  it("une fragmentos pegados de la misma palabra sin espacio", () => {
    const out = joinTextItems([
      item("gran", 0, 100, 20),
      item("des", 20, 100, 15),
    ]);
    expect(out).toBe("grandes");
  });

  it("inserta espacio cuando hay hueco horizontal real", () => {
    const out = joinTextItems([
      item("Hola", 0, 100, 20),
      item("mundo", 40, 100, 25),
    ]);
    expect(out).toBe("Hola mundo");
  });

  it("inserta salto de línea cuando cambia la posición vertical", () => {
    const out = joinTextItems([
      item("Linea1", 0, 100, 30),
      item("Linea2", 0, 80, 30),
    ]);
    expect(out).toBe("Linea1\nLinea2");
  });

  it("respeta el fin de línea explícito (hasEOL)", () => {
    const out = joinTextItems([
      item("A", 0, 100, 5),
      { str: "", hasEOL: true },
      item("B", 0, 100, 5),
    ]);
    expect(out).toBe("A\nB");
  });
});
