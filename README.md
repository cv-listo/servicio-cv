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
- Flujo de descuento privado para QA sin pago real.
- Mercado Pago Checkout Pro preparado con webhook y pantalla de verificación.
- IA server-side configurable: Groq por defecto, Gemini/OpenAI opcionales y fallback local.
- Generación final única por pedido.
- PDF mediante impresión/guardar como PDF del navegador.
- Páginas incluidas: `index.html`, `confirmar.html`, `pago.html`, `formulario.html`, `preview.html`, `descargar.html`, `retomar.html`.

## Probar flujo con codigo privado

1. Abrir `confirmar.html?plan=basic`, `professional` o `focused`.
2. Ingresar cualquier email.
3. Usar el valor privado configurado en `TEST_DISCOUNT_CODE`.
4. Completar formulario.
5. Revisar preview A4.
6. Confirmar generación final.
7. Guardar como PDF desde el navegador.

En Cloudflare Pages, el valor privado de `TEST_DISCOUNT_CODE` crea una orden `discount_test` en D1 y habilita el formulario.

## Cloudflare Pages

El `wrangler.toml` ya incluye el binding D1:

```toml
binding = "DB"
database_name = "cv_listo"
```

Aplicar `schema.sql` en Cloudflare D1 para crear o actualizar tablas.

Variables de entorno necesarias en Cloudflare Pages:

```text
TEST_DISCOUNT_CODE = (codigo privado de QA)
MP_ACCESS_TOKEN = (Access Token de Mercado Pago)
MP_WEBHOOK_SECRET = (Secret de webhook de Mercado Pago)
APP_BASE_URL = https://servicio-cv.pages.dev
LLM_PROVIDER = groq
GROQ_API_KEY = (API key de Groq)
GROQ_MODEL_PROFESSIONAL = llama-3.1-8b-instant
GROQ_MODEL_FOCUSED = llama-3.3-70b-versatile
PLAN_BASIC_AMOUNT = 9999
PLAN_PROFESSIONAL_AMOUNT = 19999
PLAN_FOCUSED_AMOUNT = 29999
ADMIN_USER = (usuario para /admin.html)
ADMIN_PASSWORD = (contraseña para /admin.html)
```

Variables opcionales:

```text
AI_TIMEOUT_MS = 10000
GROQ_MODEL = (override global opcional; si se configura, pisa los modelos por plan)
GEMINI_API_KEY = ...
OPENAI_API_KEY = ...
RESEND_API_KEY = ...
EMAIL_FROM = (remitente verificado si se habilita email transaccional)
DEBUG_AI = false
```

Los valores `PLAN_*_AMOUNT` controlan los precios que se muestran en la web y los montos enviados a Mercado Pago. Si no están configurados, se usan los valores por defecto del repositorio.

El plan Básico no consume LLM externo. `GROQ_MODEL_PROFESSIONAL` define el modelo del plan intermedio y `GROQ_MODEL_FOCUSED` el del plan Enfocado. Usar `GROQ_MODEL` solo si querés forzar un único modelo para todos los planes con IA.

`admin.html` permite revisar pedidos, datos cargados, pagos, eventos e IA. Protegelo con `ADMIN_USER` y `ADMIN_PASSWORD`.

`TEST_DISCOUNT_CODE` define el código interno que habilita un pedido gratuito. Debe ser un valor privado y no publicarse en frontend ni documentación pública.

No guardar credenciales en el repositorio. Usar Variables and Secrets de Cloudflare.

El formulario de soporte manual usa FormSubmit temporalmente hacia un correo operativo. No usar `soporte@cvlisto.com.ar` como destino real hasta activar el dominio/casilla.

## Prefill del formulario por archivos (Profesional y Enfocado)

En el Paso 1 del formulario, los planes con IA pueden subir hasta 5 archivos (PDF con texto o `.docx`, máximo 4 MB cada uno). El flujo es:

1. **Extracción** — `POST /api/extract` lee el texto de cada archivo en memoria (sin guardar binarios) y lo devuelve. El texto se vuelca al campo "notas" como contexto adicional para la IA del CV.
2. **Prefill estructurado** — `POST /api/ai/prefill-profile` envía ese texto a Groq con un prompt específico que devuelve campos estructurados (`contact`, `links`, `objective`, `experiences`, `educationItems`, `skills`, `notes`) con nivel de confianza por dato.
3. **Panel de revisión** — el usuario ve "Esto encontramos en tus archivos", con checkboxes por dato. Los de baja confianza vienen desmarcados; los datos que el usuario ya completó manualmente no se marcan para no pisarlos.
4. **Aplicación granular** — al confirmar, solo lo seleccionado se vuelca a los campos y repeaters (hasta 3 experiencias y 3 ítems de educación). Todo queda 100 % editable.

El texto crudo de los archivos vive solo en memoria del navegador entre las dos llamadas al backend; nunca se persiste en D1. Solo se guarda lo que el usuario aceptó y quedó en el formulario, igual que cualquier dato tipeado.

Verificación QA: ver `QA-PREFILL.md`.

## Arquitectura objetivo

Ver `ARCHITECTURE.md`.

## Próxima etapa

- Probar Mercado Pago en sandbox y producción.
- Configurar `MP_WEBHOOK_SECRET` y validar firma de webhooks.
- En producción, mantener `TEST_DISCOUNT_CODE` como secreto privado de Cloudflare y no exponerlo en frontend ni documentación pública.
- Implementar caché IA persistente con `ai_generations`.
- Mejorar plantillas de CV y versión ATS-friendly.
- Evaluar email automático, versión editable real y OCR.

## Checklist Mercado Pago

1. Crear una orden sin código de descuento privado.
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
