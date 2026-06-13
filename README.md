# CV Listo

Generador automático de CVs con landing comercial, checkout, formulario guiado, asistencia IA, vista previa editable y generación final única.

## Publicación

El proyecto está desplegado en Cloudflare Pages:

```text
https://servicio-cv.pages.dev/
```

## Estado actual

- Frontend HTML/CSS/JS puro, sin framework ni build step.
- Cloudflare Pages Functions en `/functions/api`.
- Cloudflare D1 para órdenes, perfiles, auditorías y documentos finales.
- Flujo `TEST` para QA sin pago real.
- Mercado Pago Checkout Pro preparado con webhook y pantalla de verificación.
- IA server-side configurable: Groq por defecto, Gemini/OpenAI opcionales y fallback local.
- Generación final única por pedido.
- PDF mediante impresión/guardar como PDF del navegador.
- Páginas incluidas: `index.html`, `confirmar.html`, `pago.html`, `formulario.html`, `preview.html`, `descargar.html`, `retomar.html`.

## Probar flujo TEST

1. Abrir `confirmar.html?plan=basic`, `professional` o `focused`.
2. Ingresar cualquier email.
3. Usar código `TEST`.
4. Completar formulario.
5. Revisar preview A4.
6. Confirmar generación final.
7. Guardar como PDF desde el navegador.

En Cloudflare Pages, el código `TEST` crea una orden `discount_test` en D1 y habilita el formulario.

## Cloudflare Pages

El `wrangler.toml` ya incluye el binding D1:

```toml
binding = "DB"
database_name = "cv_listo"
```

Aplicar `schema.sql` en Cloudflare D1 para crear o actualizar tablas.

Variables de entorno necesarias en Cloudflare Pages:

```text
TEST_DISCOUNT_CODE = TEST
MP_ACCESS_TOKEN = (Access Token de Mercado Pago)
LLM_PROVIDER = groq
GROQ_API_KEY = (API key de Groq)
GROQ_MODEL = llama-3.1-8b-instant
```

Variables opcionales:

```text
MP_WEBHOOK_SECRET = (secreto de webhook de Mercado Pago)
AI_TIMEOUT_MS = 10000
GEMINI_API_KEY = ...
OPENAI_API_KEY = ...
DEBUG_AI = false
```

No guardar credenciales en el repositorio. Usar Variables and Secrets de Cloudflare.

El formulario de soporte manual usa FormSubmit hacia `mariano.pereyra.1990.1@gmail.com`. La primera vez requiere activar el formulario desde el correo recibido.

## Arquitectura objetivo

Ver `ARCHITECTURE.md`.

## Próxima etapa

- Probar Mercado Pago en sandbox y producción.
- Configurar `MP_WEBHOOK_SECRET` y validar firma de webhooks.
- Implementar caché IA persistente con `ai_generations`.
- Mejorar plantillas de CV y versión ATS-friendly.
- Evaluar email automático, DOCX y OCR.
