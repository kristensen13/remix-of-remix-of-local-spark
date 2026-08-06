# Diseño: Pantalla de Facturas

Fecha: 2026-08-07

## Contexto

Cuarta y última pantalla del módulo de facturación en el frontend, tras
Clientes (`44dbac6`), Series (`9f7411d`) y Presupuestos (`08249a6`). El
backend de Facturas (`FacturasController`, `PresupuestosController.
ConvertirAFactura`) ya está mergeado en `68caa1c` y ampliado con
`Anular`/`Rectificar` en una sesión posterior a este handoff — no hay alta
manual de facturas: nacen únicamente al convertir un Presupuesto en estado
`Aceptado` (`POST /api/presupuestos/{id}/convertir-a-factura`), o al
rectificar una factura existente (`POST /api/facturas/{id}/rectificar`,
fuera de alcance de esta iteración).

## Alcance

**Incluido en esta iteración** (decidido con el usuario):
- Listado de facturas (pantalla nueva `/facturas`).
- Botón "Convertir a factura" en el listado de Presupuestos, para
  presupuestos `Aceptado` sin factura asociada — el flujo que quedó
  deliberadamente fuera de la pantalla de Presupuestos.
- Botón "Marcar cobrada" en el listado de Facturas, para facturas
  `Emitida`.

**Explícitamente fuera de alcance** (se revisa en una iteración posterior,
por ser operaciones fiscalmente delicadas — anular una factura ya
entregada normalmente exige una rectificativa, no un cambio de estado
simple, según la propia nota del backend en `FacturasController.Anular`):
- Botón de anular factura.
- Botón de crear rectificativa.
- Generación de PDF (`Factura.PdfUrl` existe en el esquema pero no hay
  servicio que lo rellene).
- Filtros de listado por cliente o estado (el backend ya soporta
  `?clienteId=`, pero con el volumen actual de facturas un listado simple
  ordenado por fecha de emisión descendente es suficiente, igual que
  Series/Presupuestos en su primera versión).

## Cambios de backend (2, pequeños)

1. **`Factura.FechaCobro` (`DateTime?`) + migración EF Core.**
   `MarcarCobradaRequest.FechaCobro` ya existe en el DTO pero
   `FacturasController.MarcarCobrada` lo ignora — la entidad no tiene
   dónde guardarlo. Es un dato fiscal real (fecha de cobro efectivo) que
   se estaba descartando en silencio; se corrige antes de construir el
   botón de frontend que depende de él. Columna `timestamptz` en Postgres,
   igual que `FechaEmision`.
2. **`PresupuestoSummaryDto` gana `FacturaId` (`Guid?`).**
   Ya existe en la entidad `Presupuesto` y en `PresupuestoDto`, solo falta
   en el summary. Es lo que permite al listado de Presupuestos saber si
   una fila `Aceptado` ya se convirtió sin pedir el detalle de cada una
   (`GET /api/presupuestos/{id}`).

Ningún otro endpoint cambia. `[Authorize]` + filtro por `CurrentUserId` ya
cubren ambos endpoints nuevos que consume esta pantalla; no se toca esa capa.

## Archivos — módulo nuevo `frontend/src/app/features/facturas/`

Solo lectura + transición de estado, sin alta/edición manual (igual que
Series no tiene edición, por ser append-only fiscalmente):

- `core/models/factura.models.ts` — interfaces `Factura`, `FacturaSummary`,
  enum `EstadoFactura` (numérico, mismo orden que `FacturacionEnums.cs`:
  `Emitida, Cobrada, Anulada, Rectificada`), `ESTADO_FACTURA_LABELS`.
- `facturas.service.ts` — signals `facturas`, `isLoading`, `errorMessage`;
  `load()`, `marcarCobrada(id, fechaCobro)`. Mismo patrón que
  `presupuestos.service.ts`.
- `facturas.ts` + `.html` + `.css` — listado (número completo, cliente,
  fecha emisión, total, estado); botón "Marcar cobrada" visible solo si
  `estado === Emitida` (comprobación defensiva también para
  `Anulada`/`Rectificada`, aunque esta iteración no los genera).
- `marcar-cobrada-modal.ts` — modal `<dialog>` nativo con
  `<input type="date">` de fecha de cobro (por defecto hoy).
- Ruta `facturas` en `app.routes.ts` (children del `Layout`, junto a
  `presupuestos`) + enlace nuevo en `shared/layout/layout.html`.

## Archivos — cambios en `features/presupuestos/` existente

El modal de conversión vive en Presupuestos, no en Facturas: actúa sobre
un Presupuesto y usa sus datos, mismo principio que ya sigue
`presupuesto-form-modal` viviendo junto a la pantalla que lo abre.

- `core/models/presupuesto.models.ts`: `PresupuestoSummary` gana
  `facturaId: string | null`.
- `convertir-a-factura-modal.ts` (nuevo, en `features/presupuestos/`):
  selector de `Serie` (vía `SeriesService`, ya existente) + input opcional
  de % IRPF.
- `presupuestos.service.ts`: nuevo método
  `convertirAFactura(id, serieId, porcentajeRetencionIrpf)` →
  `POST /api/presupuestos/{id}/convertir-a-factura`, recarga tras éxito.
- `presupuestos.ts` / `.html`: botón "Convertir a factura" en filas con
  `estado === Aceptado && facturaId === null`.

## Flujo de datos

1. **Conversión**: usuario pulsa "Convertir a factura" en una fila
   Aceptada sin `facturaId` → se abre `ConvertirAFacturaModal` →
   `SeriesService.load()` puebla el selector → usuario elige Serie (+ IRPF
   opcional) → `presupuestosService.convertirAFactura(...)` → backend
   asigna número correlativo atómico, calcula totales, crea la `Factura`,
   marca `presupuesto.FacturaId` → respuesta `FacturaDto` → el modal se
   cierra, `presupuestosService.load()` recarga (la fila ya no muestra el
   botón), banner: "Factura {numeroCompleto} creada correctamente."
2. **Marcar cobrada**: fila con `estado === Emitida` → botón abre modal
   con fecha de cobro (por defecto hoy) →
   `facturasService.marcarCobrada(id, fechaCobro)` →
   `POST /api/facturas/{id}/marcar-cobrada` con
   `` fecha ? `${fecha}T00:00:00Z` : null `` (patrón fecha-como-instante-
   UTC ya fijado en el fix de Presupuestos, obligatorio aquí también
   porque `FechaCobro` es `timestamptz`) → recarga listado.

## Manejo de errores

- **409 Conflict** (presupuesto ya convertido, factura no está en
  `Emitida` al marcar cobrada, carrera entre pestañas): se muestra el
  `message` del backend tal cual, vía `extractErrorMessage` — mismo
  patrón que Clientes/Series/Presupuestos.
- **400 BadRequest** (serie inexistente): igual, mensaje del backend en
  el modal, sin cerrarlo, para que el usuario pueda corregir.
- **Validación de fecha de cobro**: Angular emite `null` (no `NaN` ni
  string vacío) al vaciar un `<input type="date">`; si es `null` se
  bloquea el submit con mensaje inline, no se manda al backend.

## Testing

Mismo enfoque TDD por capas que Series/Presupuestos:

**Backend** (xUnit + Testcontainers Postgres):
- Integración: `marcar-cobrada` persiste `FechaCobro` (releer de BD tras
  la llamada) — hoy no hay ningún test que cubra esto, por eso el bug
  pasó desapercibido.
- Unitario: `PresupuestoMappingExtensions.ToSummaryDto` refleja el
  `FacturaId` real de la entidad, antes y después de convertir.
- Regresión: los tests existentes de `MarcarCobrada`/`ConvertirAFactura`
  no deben romperse (mismas validaciones de estado/conflicto).

**Frontend** (Vitest):
- `facturas.service.spec.ts`: `load()` puebla signals; `marcarCobrada()`
  llama al endpoint con la fecha en formato UTC-instante y recarga.
- `facturas.spec.ts`: botón "Marcar cobrada" solo visible con
  `estado === Emitida`.
- `convertir-a-factura-modal.spec.ts`: selector de series se puebla desde
  `SeriesService`; submit sin serie seleccionada bloquea; error 409 se
  muestra sin cerrar el modal.
- `presupuestos.spec.ts` (ampliación): botón "Convertir a factura"
  visible solo si `estado === Aceptado && facturaId === null`; tras
  conversión exitosa desaparece.

## Convenciones de casa aplicadas (fijadas en Series/Presupuestos)

`output()` nativo, servicio completo inyectado y expuesto al template
(`protected readonly xxxService = inject(...)`), un signal por campo de
formulario, patrón fecha-como-instante-UTC y validación de rango/coerción
explícita para todo campo numérico con dinero real, aplicados desde el
primer commit — no como fix posterior.
