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
MP_WEBHOOK_SECRET = (Secret de webhook de Mercado Pago)
APP_BASE_URL = https://servicio-cv.pages.dev
LLM_PROVIDER = groq
GROQ_API_KEY = (API key de Groq)
GROQ_MODEL = llama-3.1-8b-instant
PLAN_BASIC_AMOUNT = 9999
PLAN_PROFESSIONAL_AMOUNT = 19999
PLAN_FOCUSED_AMOUNT = 29999
ADMIN_USER = (usuario para /admin.html)
ADMIN_PASSWORD = (contraseña para /admin.html)
```

Variables opcionales:

```text
AI_TIMEOUT_MS = 10000
GEMINI_API_KEY = ...
OPENAI_API_KEY = ...
DEBUG_AI = false
```

Los valores `PLAN_*_AMOUNT` controlan los precios que se muestran en la web y los montos enviados a Mercado Pago. Si no están configurados, se usan los valores por defecto del repositorio.

`admin.html` permite revisar pedidos, datos cargados, pagos, eventos e IA. Protegelo con `ADMIN_USER` y `ADMIN_PASSWORD`.

No guardar credenciales en el repositorio. Usar Variables and Secrets de Cloudflare.

El formulario de soporte manual usa FormSubmit hacia `soporte@cvlisto.com.ar`. La primera vez requiere activar el formulario desde el correo recibido.

## Arquitectura objetivo

Ver `ARCHITECTURE.md`.

## Próxima etapa

- Probar Mercado Pago en sandbox y producción.
- Configurar `MP_WEBHOOK_SECRET` y validar firma de webhooks.
- En producción, dejar `TEST_DISCOUNT_CODE` vacío o usar un código no público.
- Implementar caché IA persistente con `ai_generations`.
- Mejorar plantillas de CV y versión ATS-friendly.
- Evaluar email automático, versión editable real y OCR.

## Checklist Mercado Pago

1. Crear una orden sin código `TEST`.
2. Confirmar que `/api/orders` devuelve una URL de checkout.
3. Completar pago en Mercado Pago sandbox.
4. Verificar que el usuario vuelve a `pago.html`.
5. Confirmar que el webhook actualiza la orden a `paid`.
6. Confirmar que `pago.html` redirige a `formulario.html`.
7. Completar formulario, preview y generación final.

Consultas útiles en D1:

```sql
SELECT id, email, plan_id, amount, status, mp_preference_id, mp_payment_id, mp_status, paid_at, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;

SELECT payment_id, order_id, mp_status, amount, currency, signature_valid, processed, error, created_at
FROM mp_events
ORDER BY created_at DESC
LIMIT 20;
```
