# CV Listo v2 - Arquitectura automática

## Objetivo

Convertir la landing actual en una app automática donde cada pago habilita una generación de CV.

## Recomendación

Arquitectura principal:

- Frontend: Cloudflare Pages.
- Backend: Cloudflare Workers / Pages Functions.
- Base de datos: Cloudflare D1.
- Storage temporal: Cloudflare R2.
- Pagos: Mercado Pago Checkout Pro.
- OCR inicial: cliente/browser o LLM multimodal.
- LLM opcional: Gemini Flash / Flash-Lite u otro proveedor con costo variable bajo.
- PDF: generación client-side con HTML/CSS imprimible. DOCX queda como mejora futura.

## Planes comerciales

```text
Básico - $9.999 ARS
  Sin LLM.
  Datos estructurados + plantilla limpia.
  PDF.
  1 generación.

Profesional - $19.999 ARS
  LLM económico para mejorar redacción.
  Perfil profesional y experiencia mejor redactados.
  PDF A4.
  Preview editable y una única generación final.

Enfocado - $29.999 ARS
  LLM obligatorio.
  Adaptación a puesto, empresa y aviso laboral.
  Versión ATS-friendly.
  PDF A4.
  Preview editable y una única generación final.
```

## Flujo técnico

```text
Usuario elige plan
  -> POST /api/orders
  -> Worker crea order_id en D1
  -> Worker crea preferencia Mercado Pago Checkout Pro
  -> Usuario paga
  -> Webhook Mercado Pago valida pago server-side
  -> D1 cambia order.status = paid
  -> Usuario completa formulario guiado
  -> Upload opcional a R2
  -> OCR/LLM si hace falta
  -> Preview editable
  -> Generación PDF
  -> Descarga
```

## Estados de pedido

```text
created
discount_applied
discount_test
payment_pending
paid
form_started
validating
preview_ready
final_confirmed
processing
generated
delivered
expired
refunded
error
```

## Tablas D1 mínimas

```sql
orders (
  id TEXT PRIMARY KEY,
  token TEXT,
  email TEXT,
  plan_id TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  discount_code TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  external_reference TEXT,
  data_json TEXT,
  cv_json TEXT,
  display_flags TEXT,
  generated_at TEXT,
  created_at TEXT,
  paid_at TEXT,
  expires_at TEXT
);

order_profiles (
  order_id TEXT PRIMARY KEY,
  raw_json TEXT,
  normalized_json TEXT,
  consent_at TEXT
);

files (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  kind TEXT,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  r2_key TEXT,
  extracted_text TEXT,
  created_at TEXT,
  delete_after TEXT
);

generations (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  status TEXT,
  input_json TEXT,
  output_json TEXT,
  pdf_r2_key TEXT,
  docx_r2_key TEXT,
  error TEXT,
  created_at TEXT
);
```

## Mercado Pago

Usar Checkout Pro, no links fijos, para poder:

- crear una preferencia por pedido;
- enviar `external_reference = order_id`;
- recibir webhook;
- validar pago server-side;
- impedir generación sin pago aprobado.

El frontend nunca decide si el pedido está pagado. El Worker consulta Mercado Pago y actualiza D1.

## Código TEST

El código de descuento `TEST` sirve solo para pruebas. Debe validarse del lado servidor.

Reglas:

- normalizar con `trim().toUpperCase()`;
- permitirlo solo si está habilitado por variable/secret del entorno;
- crear orden con estado `discount_test`;
- saltear Mercado Pago;
- habilitar formulario y generación como si estuviera pagado;
- deshabilitar o rotar el código antes de producción pública.

## Generación única

Cada compra habilita una única generación final.

Antes de generar:

- formulario editable;
- preview editable;
- validaciones client-side y server-side;
- advertencias de calidad;
- confirmación explícita del usuario.

Después de generar:

- bloquear edición;
- permitir descarga del resultado;
- no permitir regeneraciones sobre el mismo pedido.

Regla:

```text
Si orders.generated_at no es null, /api/generate-final responde 409.
```

## Archivos

Uploads solo después de pago confirmado.

Límites sugeridos:

- máximo 5 archivos;
- 8 a 10 MB por archivo;
- PDF, JPG, PNG, WEBP.

R2 privado. Links temporales. Borrado programado.

## LLM

El LLM debe editar, ordenar y mejorar redacción. No debe inventar datos.

Proveedor principal recomendado:

- Gemini Flash-Lite / Gemini Flash en modo pago de bajo costo para producción.

Fallbacks posibles:

- DeepSeek / Qwen vía proveedor compatible con OpenAI.
- Mistral Small.
- OpenAI mini/nano.
- Cloudflare Workers AI como fallback simple.

Evitar depender de free tiers como única base productiva. Usarlos para pruebas o bajo volumen.

Reglas:

- no inventar empleos;
- no inventar fechas;
- no inventar estudios;
- no inventar certificaciones;
- devolver JSON;
- validar entidades antes de generar CV.
- salida JSON estructurada.
- preview editable antes de descarga.

## MVP automático recomendado

Etapa 0:

- Landing publicada en GitHub Pages.
- Flujo estático de prueba con `TEST` y `localStorage`.
- Páginas: confirmar, formulario, preview y descarga.
- Functions base preparadas para Cloudflare Pages.

Etapa 1:

- Cloudflare Pages + Worker + D1.
- Checkout Pro + webhook.
- Formulario propio sin archivos.
- Plantilla HTML A4.
- Descarga por impresión a PDF.
- Sin LLM.
- Publicar solo Plan Básico o permitir planes altos como "próximamente".

Etapa 2:

- Adaptador LLM.
- Plan Profesional.
- Prompts JSON con reglas anti-invención.

Etapa 3:

- Plan Enfocado.
- Puesto objetivo, empresa y texto del aviso.
- ATS-friendly.

Etapa 4:

- R2 para archivos.
- Extracción PDF/imágenes.
- OCR/LLM opcional.
- Preview editable.

Etapa 5:

- Versión editable real o DOCX como mejora futura.
- Más plantillas.
- Emails automáticos.
- Links temporales de descarga.

## Privacidad

Datos personales opcionales:

- DNI;
- teléfono;
- email;
- dirección o zona de residencia;
- localidad/provincia;
- LinkedIn.

El usuario debe poder elegir qué datos se muestran en el CV final mediante `display_flags`.

No pedir como campos dedicados:

- estado civil;
- datos de salud;
- afiliación política o sindical.

Pedir consentimiento. Borrar datos y archivos al finalizar el plazo operativo.
