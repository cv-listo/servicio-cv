# CV Listo - Seguimiento de fixes de auditoria

Este archivo centraliza las recomendaciones pendientes de las auditorias de producto, UX, seguridad, Mercado Pago e IA.

Estados:

- `[ ]` Pendiente.
- `[x]` Completado.
- `[~]` Parcial / requiere prueba real.

## Critico antes de lanzamiento abierto

- [x] Desactivar o cambiar `TEST_DISCOUNT_CODE` en produccion para que no exista un bypass publico de pago.
- [x] Implementar `/api/payments/check` para conciliacion manual con Mercado Pago desde `pago.html`.
- [x] Conectar `pago.html` al endpoint `/api/payments/check` cuando el webhook tarde o falle.
- [x] Revisar y eliminar fallback local de produccion en `formulario.html`, `preview.html` y `descargar.html` si permite continuar sin backend.
- [x] Validar que `generate-final` no marque localmente como generado si falla el backend en produccion.
- [ ] Probar un flujo completo de pago real con precios finales `9999`, `19999`, `29999`.

## Mercado Pago

- [x] Crear preference server-side con `external_reference` y metadata.
- [x] Usar `pago.html` como pantalla intermedia post-pago.
- [x] Consultar pago real server-to-server con `MP_ACCESS_TOKEN`.
- [x] Validar monto, moneda, estado y referencia de orden.
- [x] Registrar eventos en `mp_events`.
- [x] Soportar webhook firmado y fallback IPN controlado.
- [x] Agregar `source_news=webhooks` a `notification_url`.
- [x] Agregar endpoint de conciliacion manual `/api/payments/check`.
- [ ] Probar estados reales/sandbox: `approved`, `pending`, `rejected`, `cancelled`, `refunded`, `charged_back`.
- [x] Registrar mejor reversas posteriores a `generated` sin reabrir el CV.
- [ ] Limpiar o expirar ordenes viejas `payment_pending` de pruebas.

## IA / Groq

- [x] Integrar Groq como proveedor principal configurable.
- [x] Mantener Gemini/OpenAI como alternativas por variables de entorno.
- [x] Fallback local si falla el proveedor.
- [x] Plan Basico sin IA.
- [x] Registrar auditoria basica en `ai_generations`.
- [x] Mejorar salida de experiencia informal y bullets.
- [x] Normalizar texto final (`gondolas` -> `góndolas`, `Posnet`, mayusculas iniciales).
- [x] Implementar cache efectivo por `input_hash` antes de llamar al LLM.
- [x] Limitar llamadas IA por orden/hash.
- [ ] Endurecer validacion anti-alucinacion para rol, estudios, fechas, herramientas e idiomas.
- [ ] Probar prompt injection en campos libres y `jobAd`.
- [ ] Mejorar prompt del plan Enfocado para priorizar keywords sin copiar texto del aviso.

## Seguridad y privacidad

- [x] No devolver `token` en `GET /api/orders/:id`.
- [x] `Referrer-Policy: no-referrer` en `_headers`.
- [x] Admin oculto hasta login correcto.
- [x] Admin con `ADMIN_USER` y `ADMIN_PASSWORD`.
- [x] Recuperacion por email sin enumerar emails.
- [x] Quitar autenticacion alternativa por `ADMIN_TOKEN` si ya no se usa en codigo/documentacion.
- [x] Evitar guardar password admin en `sessionStorage`; evaluar sesion temporal o Cloudflare Access.
- [x] Agregar CSP en `_headers`.
- [x] Aplicar expiracion real usando `orders.expires_at` en endpoints sensibles.
- [ ] Agregar rate limit basico por email/order/IP para endpoints criticos.
- [x] Revisar soporte con FormSubmit y documentar tratamiento de adjuntos/PII.
- [ ] Migrar soporte a endpoint propio `/api/support` con Resend o proveedor transaccional.

## Admin y soporte

- [x] Crear `admin.html`.
- [x] Crear `/api/admin/orders` y `/api/admin/orders/:id`.
- [x] Mostrar pedidos, pagos, datos cargados, CV final, eventos MP e IA.
- [x] Mostrar detalle legible por secciones del formulario.
- [x] Permitir copiar links de continuar, preview y descarga.
- [x] Unificar soporte y retomar pedido en `soporte.html`.
- [x] File picker custom en soporte.
- [x] Validar adjuntos de soporte: PDF/JPG/PNG hasta 2 MB.
- [x] Agregar paginacion real al admin.
- [x] Agregar colores por estado en filas del admin: `paid`, `generated`, `pending`, `rejected`.
- [ ] Agregar notas internas de soporte por pedido.
- [x] Agregar accion admin para reenviar/copiar link de recuperacion con texto listo.

## UX/UI y contenido

- [x] Redisenar landing con hero mas visual.
- [x] Agregar mockup de CV y tarjetas flotantes IA/preview.
- [x] Agregar trust strip y seccion de seguridad/control.
- [x] Mejorar cards de planes y alinear precios.
- [x] Precios dinamicos desde variables Cloudflare.
- [x] Limpiar duplicidad de "Retomar pedido" del header.
- [x] Mover soporte a pagina dedicada.
- [x] Descarga celebratoria con proximos pasos.
- [x] Preview con checklist visual y telemetria A4.
- [x] Wizard con iconos/microcopy por paso.
- [x] Revisar toda la web para eliminar restos de promesas no implementadas.
- [ ] Revisar mobile completo en Android Chrome e iOS Safari.
- [x] Mejorar `pago.html` con estados mas claros para pendiente/rechazado/reintento.
- [x] Agregar aviso en descarga sobre guardar PDF desde navegador/mobile.
- [ ] Optimizar `og-image.png` si sigue pesando demasiado.
- [ ] Mejorar favicon/logo final.

## CV generado

- [x] Mejorar jerarquia visual del CV.
- [x] Usar `cv_json` sellado en descarga si existe.
- [x] Agregar base `cv-page-ats`.
- [x] Evitar secciones vacias y placeholders falsos.
- [ ] Crear selector real de plantilla: visual vs ATS-friendly.
- [x] Mejorar control de overflow A4 y sugerencias automaticas para reducir texto.
- [ ] Validar impresion/PDF en Chrome, Edge, Firefox y mobile.
- [ ] Evaluar generacion PDF real en una fase posterior.

## Base de datos y mantenimiento

- [x] Agregar campos Mercado Pago a `orders`.
- [x] Agregar `mp_events`.
- [x] Agregar `ai_generations`.
- [x] Agregar indices utiles: `orders(token)`, `orders(external_reference)`, `orders(mp_payment_id)`.
- [x] Agregar limpieza/expiracion de ordenes `payment_pending` viejas.
- [x] Agregar limpieza de registros IA antiguos si crecen demasiado.
- [ ] Resolver ruido de line endings que deja archivos como modificados sin diff real.

## Checklist de pruebas finales

- [x] Flujo `TEST` interno con codigo privado.
- [x] Pago real Basico.
- [ ] Pago real Profesional.
- [ ] Pago real Enfocado.
- [ ] Pago pendiente.
- [ ] Pago rechazado.
- [ ] Webhook duplicado.
- [x] Webhook con firma valida.
- [ ] Webhook con firma invalida.
- [x] Fallback IPN controlado.
- [~] Formulario parcial y retomar.
- [x] IA Groq OK.
- [ ] IA Groq timeout/rate limit.
- [x] Generacion final unica.
- [x] Reintento de `generate-final`.
- [ ] Descarga desde link admin.
- [ ] Soporte con adjunto valido.
- [ ] Soporte con adjunto invalido.
- [x] Admin login incorrecto/correcto.

