# CV Listo

Landing y base visual para una app de generación automática de CVs.

## Publicación

Este sitio está preparado para GitHub Pages desde `main / root`.

## Estado actual

- Landing estática publicada en GitHub Pages.
- Flujo estático navegable con código `TEST` usando `localStorage`.
- Páginas incluidas: `confirmar.html`, `formulario.html`, `preview.html`, `descargar.html`, `retomar.html`.
- Sin backend todavía.
- Sin validación automática de pagos.
- Sin OCR ni LLM todavía.
- Generación A4 básica simulada en navegador.
- Planes visibles: $10.000, $20.000 y $30.000 ARS.

## Probar flujo estático

1. Abrir `confirmar.html?plan=basic`, `professional` o `focused`.
2. Ingresar cualquier email.
3. Usar código `TEST`.
4. Completar formulario.
5. Revisar preview A4.
6. Confirmar generación final.
7. Guardar como PDF desde el navegador.

En GitHub Pages este flujo usa `localStorage`. En Cloudflare Pages, el endpoint `/api/orders` podrá crear órdenes reales en D1.

## Cloudflare Pages

El `wrangler.toml` ya incluye el binding D1:

```toml
binding = "DB"
database_name = "cv_listo"
```

Falta aplicar `schema.sql` en la consola de D1 para crear las tablas.

Variables de entorno necesarias en Cloudflare Pages:

```text
TEST_DISCOUNT_CODE = TEST
MP_ACCESS_TOKEN = (Access Token de Mercado Pago)
```

No guardar credenciales de Mercado Pago en el repositorio.

## Arquitectura objetivo

Ver `ARCHITECTURE.md`.

## Próxima etapa

Migrar a app serverless:

- Cloudflare Pages.
- Cloudflare Workers / Pages Functions.
- Cloudflare D1.
- Cloudflare R2.
- Mercado Pago Checkout Pro.
- Generación PDF/DOCX en navegador.
- OCR/LLM opcional por pedido.
