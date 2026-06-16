import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "../functions/api/webhook-mp.js";

describe("timingSafeEqual", () => {
  it("es verdadero solo para cadenas idénticas", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("es falso cuando difieren en contenido", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("es falso cuando difieren en longitud", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("maneja cadenas vacías", () => {
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "x")).toBe(false);
  });
});
