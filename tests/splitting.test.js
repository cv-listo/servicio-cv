import { describe, it, expect } from "vitest";
import { actionPhraseBoundaryPattern } from "../functions/api/ai/process-cv.js";

// Inserta un marcador donde el patrón cortaría un bullet, para inspeccionar
// el comportamiento sin lidiar con los grupos del lookahead en String.split.
function marked(text) {
  return text.replace(actionPhraseBoundaryPattern(), " ||| ");
}

describe("actionPhraseBoundaryPattern (división de bullets)", () => {
  it("NO corta tras preposiciones, conjunciones o artículos", () => {
    expect(marked("sistemas de gestión operativa")).not.toContain("|||");
    expect(marked("indicadores y control de procesos")).not.toContain("|||");
    expect(marked("control de calidad y gestión de equipo")).not.toContain("|||");
    expect(marked("encargado del manejo de caja")).not.toContain("|||");
  });

  it("SÍ separa cuando arranca una acción nueva en otra cláusula", () => {
    const out = marked("atención al cliente manejo de caja");
    expect(out).toContain("|||");
    const parts = out.split("|||").map((p) => p.trim());
    expect(parts).toEqual(["atención al cliente", "manejo de caja"]);
  });

  it("no altera un bullet de una sola acción", () => {
    expect(marked("Limpieza del salón")).not.toContain("|||");
  });
});
