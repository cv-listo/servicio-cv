import { describe, it, expect } from "vitest";
import { isProtectedAssetPath } from "../functions/_middleware.js";

describe("isProtectedAssetPath", () => {
  it("bloquea documentación interna, schema y configuración", () => {
    expect(isProtectedAssetPath("/schema.sql")).toBe(true);
    expect(isProtectedAssetPath("/README.md")).toBe(true);
    expect(isProtectedAssetPath("/ARCHITECTURE.md")).toBe(true);
    expect(isProtectedAssetPath("/QA-PREFILL.md")).toBe(true);
    expect(isProtectedAssetPath("/package.json")).toBe(true);
    expect(isProtectedAssetPath("/package-lock.json")).toBe(true);
    expect(isProtectedAssetPath("/tsconfig.json")).toBe(true);
    expect(isProtectedAssetPath("/wrangler.toml")).toBe(true);
    expect(isProtectedAssetPath("/.dev.vars.example")).toBe(true);
    expect(isProtectedAssetPath("/.gitignore")).toBe(true);
    expect(isProtectedAssetPath("/.gitattributes")).toBe(true);
  });

  it("bloquea las carpetas de tests y node_modules", () => {
    expect(isProtectedAssetPath("/tests/utils.test.js")).toBe(true);
    expect(isProtectedAssetPath("/node_modules/vitest/index.js")).toBe(true);
  });

  it("bloquea cualquier dotfile, incluidos archivos de secretos", () => {
    expect(isProtectedAssetPath("/.dev.vars")).toBe(true);
    expect(isProtectedAssetPath("/.env")).toBe(true);
    expect(isProtectedAssetPath("/.env.local")).toBe(true);
    expect(isProtectedAssetPath("/.npmrc")).toBe(true);
    expect(isProtectedAssetPath("/.git/config")).toBe(true);
  });

  it("permite los recursos públicos bajo /.well-known/", () => {
    expect(isProtectedAssetPath("/.well-known/assetlinks.json")).toBe(false);
  });

  it("permite las páginas y assets públicos", () => {
    expect(isProtectedAssetPath("/")).toBe(false);
    expect(isProtectedAssetPath("/index.html")).toBe(false);
    expect(isProtectedAssetPath("/formulario.html")).toBe(false);
    expect(isProtectedAssetPath("/app.js")).toBe(false);
    expect(isProtectedAssetPath("/styles.css")).toBe(false);
    expect(isProtectedAssetPath("/favicon.svg")).toBe(false);
    expect(isProtectedAssetPath("/og-image.png")).toBe(false);
    expect(isProtectedAssetPath("/robots.txt")).toBe(false);
    expect(isProtectedAssetPath("/sitemap.xml")).toBe(false);
    expect(isProtectedAssetPath("/api/orders")).toBe(false);
  });

  it("no depende de mayúsculas/minúsculas en la extensión", () => {
    expect(isProtectedAssetPath("/README.MD")).toBe(true);
    expect(isProtectedAssetPath("/Schema.SQL")).toBe(true);
  });
});
