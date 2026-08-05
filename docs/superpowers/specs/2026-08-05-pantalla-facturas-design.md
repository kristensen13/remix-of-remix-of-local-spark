# Diseño: Pantalla de Facturas

Fecha: 2026-08-05

## Contexto

Cuarta y última pantalla planificada del módulo de facturación en el
frontend, después de Clientes (`44dbac6`), Series (`9f7411d`) y Presupuestos
(`08249a6`, con fix de concurrencia en `f68de45`). Orden acordado: Clientes →
Series → Presupuestos → Facturas.

`FacturasController` (backend, ya mergeado) expone `GET /api/facturas`
(con filtro opcional `?clienteId=`), `GET /api/facturas/{id}`,
`POST /api/facturas/{id}/marcar-cobrada`, `POST /api/facturas/{id}/anular` y
`POST /api/facturas/{id}/rectificar`. `PresupuestosController` expone además
`POST /api/presupuestos/{id}/convertir-a-factura`, que Presupuestos dejó
explícitamente fuera de su propio spec para implementarlo junto con Facturas
(ver "Fuera de alcance" en `2026-08-03-pantalla-presupuestos-design.md`).

**Diferencia estructural clave con Presupuestos:** `Factura` es inmutable y
no tiene creación libre — hoy el backend solo permite crear facturas vía
`convertir-a-factura` (desde un Presupuesto `Aceptado`) o `rectificar` (desde
una factura existente). No hay `PUT` ni `DELETE`. Esta iteración **amplía el
backend** para añadir alta manual (`POST /api/facturas`), porque el usuario
la pidió explícitamente durante el brainstorming — no es un patrón heredado
de Presupuestos, es nuevo.

Facturas también usa `Serie` para numeración correlativa (a diferencia de
Presupuestos, donde `Numero` es un string libre provisto por el usuario).

## Alcance

Incluye:

1. **Backend**: campo `FechaCobro` en `Factura` + migración, endpoint nuevo
   `POST /api/facturas` (alta manual), y el fix del bug de
   `MarcarCobradaRequest.FechaCobro` (ver más abajo).
2. **Frontend — pantalla de Facturas**: listado con filtros (cliente, estado,
   búsqueda por número), alta manual con líneas dinámicas, vista de detalle
   de solo lectura, marcar cobrada (con fecha), anular, rectificar (con
   líneas precargadas desde el original).
3. **Frontend — pantalla de Presupuestos**: botón "Convertir a factura" en
   presupuestos `Aceptado` sin `facturaId`, con modal de serie + retención
   IRPF opcional.

**Explícitamente fuera de alcance** (ver sección dedicada al final).

## Bug preexistente a corregir: `FechaCobro` fantasma

`MarcarCobradaRequest(DateTime FechaCobro)` exige la fecha en el body, pero
`FacturasController.MarcarCobrada` nunca la usa — ni existe un campo en la
entidad `Factura` donde guardarla. Se corrige junto con esta pantalla (no
tiene sentido exponer un botón "Marcar cobrada" en el frontend que pida una
fecha para tirarla a la basura):

```csharp
// Data/Entities/Factura.cs — nueva propiedad
public DateTime? FechaCobro { get; set; }
```

Nueva migración EF Core (`AddFacturaFechaCobro` o similar) que agrega la
columna `timestamptz` nullable. `MarcarCobrada` pasa a:

```csharp
factura.Estado = EstadoFactura.Cobrada;
factura.FechaCobro = request.FechaCobro;
await _db.SaveChangesAsync();
```

`FacturaDto` y `FacturaMappingExtensions.ToDto()` incluyen `FechaCobro`.

## Backend: `POST /api/facturas` (alta manual)

Nuevo DTO en `Dtos/Facturas/FacturaDtos.cs`:

```csharp
public record CreateFacturaRequest(
    Guid ClienteId,
    Guid SerieId,
    DateTime? FechaVencimiento,
    decimal? PorcentajeRetencionIrpf,
    List<LineaPresupuestoRequest> Lineas); // reutiliza el mismo shape de línea que Presupuestos
```

Nuevo método en `FacturasController`, espejo de
`PresupuestosController.ConvertirAFactura` pero partiendo de cero en vez de
un presupuesto:

```csharp
[HttpPost]
public async Task<ActionResult<FacturaDto>> Create(CreateFacturaRequest request)
{
    var clienteExiste = await _db.Clientes.AnyAsync(c => c.Id == request.ClienteId && c.UserId == CurrentUserId);
    if (!clienteExiste) return BadRequest(new { message = "El cliente indicado no existe." });

    if (request.Lineas is null || request.Lineas.Count == 0)
        return BadRequest(new { message = "La factura debe tener al menos una línea." });

    var serie = await _db.Series.SingleOrDefaultAsync(s => s.Id == request.SerieId && s.UserId == CurrentUserId);
    if (serie is null) return BadRequest(new { message = "La serie indicada no existe." });
    if (serie.EsRectificativa)
        return BadRequest(new { message = "No se puede usar una serie rectificativa para una factura normal." });

    await using var transaction = await _db.Database.BeginTransactionAsync();

    serie.UltimoNumero += 1;
    var numeroAsignado = serie.UltimoNumero;
    var numeroCompleto = $"{serie.Codigo}-{serie.Anio}-{numeroAsignado:D5}";

    var totales = _calculo.CalcularTotales(
        request.Lineas.Select(l => (l.Cantidad, l.PrecioUnitario, l.TipoIva)),
        request.PorcentajeRetencionIrpf);

    var ahora = DateTime.UtcNow;

    var factura = new Factura
    {
        Id = Guid.NewGuid(),
        UserId = CurrentUserId,
        ClienteId = request.ClienteId,
        SerieId = serie.Id,
        Numero = numeroAsignado,
        NumeroCompleto = numeroCompleto,
        Estado = EstadoFactura.Emitida,
        FechaEmision = ahora,
        FechaVencimiento = request.FechaVencimiento,
        PorcentajeRetencionIrpf = request.PorcentajeRetencionIrpf,
        BaseImponible = totales.BaseImponible,
        TotalIva = totales.TotalIva,
        TotalRetencion = totales.TotalRetencion,
        Total = totales.Total,
        CreatedAt = ahora,
        Lineas = request.Lineas.Select(l => new LineaFactura
        {
            Id = Guid.NewGuid(),
            Tipo = l.Tipo,
            Descripcion = l.Descripcion,
            Cantidad = l.Cantidad,
            PrecioUnitario = l.PrecioUnitario,
            TipoIva = l.TipoIva,
            Orden = l.Orden
        }).ToList()
    };

    _db.Facturas.Add(factura);
    await _db.SaveChangesAsync();
    await transaction.CommitAsync();

    return CreatedAtAction(nameof(GetById), new { id = factura.Id }, factura.ToDto());
}
```

La validación `serie.EsRectificativa` (rechazo con 400) es nueva respecto a
`ConvertirAFactura`, que no la tiene — ahí no hace falta porque el flujo de
conversión ya presupone un presupuesto normal. En alta manual sí hace falta
para no dejar que alguien numere una factura normal desde una serie pensada
para rectificativas.

## Frontend — Modelos

Nuevo `core/models/factura.models.ts`. Reutiliza `TipoLinea`, `TipoIva`,
`TIPO_LINEA_LABELS`, `TIPO_IVA_LABELS`, `TIPO_IVA_PORCENTAJE` importándolos
de `presupuesto.models.ts` (son idénticos en ambas pantallas, backend
comparte el mismo `FacturacionEnums.cs`) — no se duplican.

```ts
import { TipoLinea, TipoIva } from './presupuesto.models';

export enum EstadoFactura {
  Emitida,
  Cobrada,
  Anulada,
  Rectificada,
}

export const ESTADO_FACTURA_LABELS: Record<EstadoFactura, string> = {
  [EstadoFactura.Emitida]: 'Emitida',
  [EstadoFactura.Cobrada]: 'Cobrada',
  [EstadoFactura.Anulada]: 'Anulada',
  [EstadoFactura.Rectificada]: 'Rectificada',
};

export interface LineaFactura {
  id: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface Factura {
  id: string;
  clienteId: string;
  serieId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  fechaVencimiento: string | null;
  fechaCobro: string | null;
  porcentajeRetencionIrpf: number | null;
  baseImponible: number;
  totalIva: number;
  totalRetencion: number;
  total: number;
  presupuestoOrigenId: string | null;
  facturaRectificadaId: string | null;
  pdfUrl: string | null;
  lineas: LineaFactura[];
  createdAt: string;
}

export interface FacturaSummary {
  id: string;
  clienteId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  total: number;
}

export interface LineaFacturaRequest {
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface CreateFacturaRequest {
  clienteId: string;
  serieId: string;
  fechaVencimiento: string | null; // instante UTC ("YYYY-MM-DDT00:00:00Z"), no fecha pelada
  porcentajeRetencionIrpf: number | null;
  lineas: LineaFacturaRequest[];
}

export interface MarcarCobradaRequest {
  fechaCobro: string; // instante UTC
}

export interface RectificarFacturaRequest {
  serieRectificativaId: string;
  motivo: string;
  lineasCorregidas: LineaFacturaRequest[];
}

export interface ConvertirAFacturaRequest {
  serieId: string;
  porcentajeRetencionIrpf: number | null;
}
```

`fechaVencimiento`/`fechaCobro` viajan como instante UTC
(`${fecha}T00:00:00Z`), igual que `fechaValidez` en Presupuestos — la columna
es `timestamptz` vía Npgsql 8.0.4 y un `DateTime` con `Kind=Unspecified`
revienta con 500 (ver nota en `CONTINUAR-MODULO-FACTURACION.md`). Se aplica
desde el primer commit, no como fix posterior.

## Frontend — Archivos

En `frontend/src/app/features/facturas/`:

- `facturas.service.ts` + `.spec.ts`
- `factura-form-modal.ts` + `.html` + `.css` + `.spec.ts` (alta manual)
- `factura-detalle-modal.ts` + `.html` + `.css` + `.spec.ts` (solo lectura)
- `marcar-cobrada-modal.ts` + `.html` + `.css` + `.spec.ts`
- `rectificar-modal.ts` + `.html` + `.css` + `.spec.ts`
- `facturas.ts` + `.html` + `.css` + `.spec.ts` (listado)

En `frontend/src/app/features/presupuestos/`:

- `convertir-a-factura-modal.ts` + `.html` + `.css` + `.spec.ts` (nuevo)
- cambios en `presupuestos.service.ts`, `presupuestos.ts`, `presupuestos.html`

## Frontend — Componentes

### `FacturasService`

```ts
readonly facturas = signal<FacturaSummary[]>([]);
readonly isLoading = signal(false);
readonly errorMessage = signal<string | null>(null);

async load(clienteId?: string): Promise<void>
  // GET /api/facturas o /api/facturas?clienteId=...

async getById(id: string): Promise<Factura>
  // GET /api/facturas/{id}, no toca los signals del servicio

async create(request: CreateFacturaRequest): Promise<Factura>
  // POST /api/facturas, luego await this.load()

async marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void>
  // POST /api/facturas/{id}/marcar-cobrada, luego await this.load()
  // errores (409, ej. no está en Emitida) van a errorMessage, no se relanzan

async anular(id: string): Promise<void>
  // POST /api/facturas/{id}/anular, luego await this.load()
  // errores (409, ya anulada) van a errorMessage

async rectificar(id: string, request: RectificarFacturaRequest): Promise<Factura>
  // POST /api/facturas/{id}/rectificar, luego await this.load()
```

El filtro por cliente re-consulta al backend (`load(clienteId)`) en vez de
filtrar client-side, porque el backend ya lo soporta vía query param. El
filtro por estado y la búsqueda por número sí son client-side (sobre
`facturas()`), vía un `computed()` en el componente de listado — no hay
endpoint para eso y el volumen esperado no lo justifica.

### `FacturaFormModal` (alta manual, sin edición)

Estructura de líneas y patrón de resumen en vivo idénticos a
`PresupuestoFormModal` (ver su spec para el detalle de `LineaFormRow`,
`resumen` computed, y la validación por línea). Diferencias:

```ts
readonly saved = output<void>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);

readonly clienteId = signal('');
readonly serieId = signal('');
readonly fechaVencimiento = signal('');              // input type="date", string vacío = sin valor
readonly porcentajeRetencionIrpf = signal<number | null>(null);
readonly lineas = signal<LineaFormRow[]>([]);

readonly resumen = computed(() => {
  // igual que Presupuestos: subtotal, ivaPorTipo, totalIva
  // + retención: totalRetencion = subtotal * (porcentajeRetencionIrpf() ?? 0) / 100
  // + total = subtotal + totalIva - totalRetencion
});

open(): void
  // resetForm(); primera línea vacía añadida por defecto
```

Inyecta `ClientesService` y `SeriesService` (igual que `PresupuestoFormModal`
inyecta `ClientesService`) para poblar los `<select>`. El `<select>` de serie
filtra `seriesService.series().filter(s => !s.esRectificativa)` — una
factura normal nunca se numera desde una serie rectificativa (regla también
aplicada en el backend, ver arriba).

**Validación de `onSubmit()`:**

1. `clienteId` y `serieId` no vacíos.
2. `porcentajeRetencionIrpf`, si no es `null`, coercionado con `Number(...)`:
   debe ser finito y estar entre `0` y `100` →
   `'El porcentaje de retención debe estar entre 0 y 100.'`.
3. Mismas reglas de líneas que Presupuestos (no vacías, descripción,
   cantidad `> 0`, precio `>= 0`).
4. Si todo pasa: arma el request (con `fechaVencimiento` como
   `${valor}T00:00:00Z` o `null` si el input está vacío), llama a
   `create()`, cierra el modal y emite `saved`; en error, `formError` vía
   `extractErrorMessage`, el modal permanece abierto.

### `FacturaDetalleModal` (solo lectura)

No hay edición de facturas (inmutables), así que el rol que en Presupuestos
cumple el modo "edición" del form modal acá es un modal de solo lectura
separado — evita forzar un modo `readonly` dentro de `FacturaFormModal` que
nunca se usaría para guardar.

```ts
readonly factura = signal<Factura | null>(null);

open(factura: Factura): void
close(): void
```

Muestra cabecera (número completo, cliente, estado, fechas), tabla de líneas
(misma estructura visual que la tabla de líneas del form modal, pero sin
inputs), y desglose de totales (base imponible, IVA por tipo, retención si
aplica, total). Si `presupuestoOrigenId` o `facturaRectificadaId` no son
`null`, se muestra una nota de procedencia ("Generada desde el presupuesto
X" / "Rectifica la factura Y").

### `MarcarCobradaModal`

```ts
readonly saved = output<void>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);
readonly facturaId = signal<string | null>(null);
readonly fechaCobro = signal('');   // input type="date", default: hoy (YYYY-MM-DD local)

open(facturaId: string): void
  // fechaCobro.set(hoy en formato YYYY-MM-DD)

async onSubmit(): Promise<void>
  // fechaCobro no vacío (el date input con default ya lo garantiza, pero se
  // valida igual por si el usuario lo borra);
  // llama a facturasService.marcarCobrada(facturaId(), { fechaCobro: `${valor}T00:00:00Z` })
```

### `RectificarModal`

```ts
readonly saved = output<void>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);

readonly facturaOriginalId = signal<string | null>(null);
readonly serieRectificativaId = signal('');
readonly motivo = signal('');
readonly lineas = signal<LineaFormRow[]>([]);   // mismo tipo que en FacturaFormModal

readonly resumen = computed(() => /* igual que FacturaFormModal, sin retención
                                      (la retención de la rectificativa hereda
                                      la de la original — el backend la toma
                                      de `original.PorcentajeRetencionIrpf`,
                                      no se pide en el request) */);

open(original: Factura): void
  // facturaOriginalId.set(original.id); motivo.set(''); serieRectificativaId.set('');
  // lineas.set(original.lineas.map(l => ({ ...l, rowId: crypto.randomUUID() })));
```

El `<select>` de serie filtra `seriesService.series().filter(s =>
s.esRectificativa)`. `motivo` es un `<textarea>` requerido (el backend no lo
valida server-side más allá de bindearlo al request — se valida solo en el
frontend con "no vacío", ya que no hay una regla de negocio adicional
documentada).

**Validación de `onSubmit()`:** `serieRectificativaId` no vacío, `motivo.trim()`
no vacío, mismas reglas de líneas que Presupuestos/FacturaFormModal.

### `Facturas` (listado)

```ts
protected readonly facturasService = inject(FacturasService);
protected readonly clientesService = inject(ClientesService);
@ViewChild(FacturaFormModal) formModal!: FacturaFormModal;
@ViewChild(FacturaDetalleModal) detalleModal!: FacturaDetalleModal;
@ViewChild(MarcarCobradaModal) marcarCobradaModal!: MarcarCobradaModal;
@ViewChild(RectificarModal) rectificarModal!: RectificarModal;

readonly filtroClienteId = signal('');
readonly filtroEstado = signal<EstadoFactura | null>(null);
readonly filtroNumero = signal('');

readonly facturasFiltradas = computed(() => {
  // aplica filtroEstado y filtroNumero (substring case-insensitive sobre
  // numeroCompleto) sobre facturasService.facturas(); filtroClienteId ya
  // filtró en el backend vía load()
});

ngOnInit(): void
  // void this.facturasService.load();
  // void this.clientesService.load();

onFiltroClienteChange(clienteId: string): void
  // filtroClienteId.set(clienteId); void this.facturasService.load(clienteId || undefined);

nombreCliente(clienteId: string): string   // igual que en Presupuestos

onNew(): void // this.formModal.open();

async onVerDetalle(f: FacturaSummary): Promise<void>
  // pide el detalle completo (getById) y abre detalleModal.open(detalle)

onMarcarCobrada(f: FacturaSummary): void
  // marcarCobradaModal.open(f.id) — visible solo si estado === Emitida

async onAnular(f: FacturaSummary): Promise<void>
  // confirm(`¿Anular la factura NUMEROCOMPLETO?`) antes de facturasService.anular(f.id)
  // visible solo si estado !== Anulada && estado !== Rectificada

async onRectificar(f: FacturaSummary): Promise<void>
  // pide el detalle completo (getById, necesita las líneas) y abre
  // rectificarModal.open(detalle)
  // visible solo si estado === Emitida || estado === Cobrada

onSaved(): void // no-op, mismo patrón que las demás pantallas
```

**Plantilla:** tabla con columnas Número completo, Cliente, Fecha emisión,
Estado (badge con color por estado, igual criterio visual que
`ESTADO_PRESUPUESTO_LABELS` en Presupuestos), Total, Acciones. Fila de
filtros arriba de la tabla: `<select>` cliente, `<select>` estado, `<input>`
búsqueda por número.

**Acciones por fila**, condicionadas al `estado`:

| Estado       | Botones                                  |
|--------------|-------------------------------------------|
| Emitida      | Ver detalle, Marcar cobrada, Rectificar, Anular |
| Cobrada      | Ver detalle, Rectificar, Anular           |
| Anulada      | Ver detalle                               |
| Rectificada  | Ver detalle                               |

### Ruteo y navegación

Añadir a `app.routes.ts`: `{ path: 'facturas', component: Facturas }` dentro
del grupo con `Layout`/`authGuard`, junto a `clientes`, `series` y
`presupuestos`. Añadir el link correspondiente en
`shared/layout/layout.html`.

## Frontend — Cambios en Presupuestos

### `PresupuestosService`

Nuevo método:

```ts
async convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<Factura>
  // POST /api/presupuestos/{id}/convertir-a-factura, luego await this.load()
  // (el presupuesto convertido ahora tiene facturaId seteado, así que el
  // botón "Convertir a factura" desaparece de esa fila tras el reload)
```

Importa `Factura` y `ConvertirAFacturaRequest` desde `factura.models.ts`.

### `ConvertirAFacturaModal` (nuevo, en `features/presupuestos/`)

```ts
readonly converted = output<Factura>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);

readonly presupuestoId = signal<string | null>(null);
readonly serieId = signal('');
readonly porcentajeRetencionIrpf = signal<number | null>(null);

open(presupuestoId: string): void
  // serieId.set(''); porcentajeRetencionIrpf.set(null); presupuestoId.set(presupuestoId)

async onSubmit(): Promise<void>
  // valida serieId no vacío, porcentajeRetencionIrpf entre 0-100 si no es null
  // llama a presupuestosService.convertirAFactura(...), cierra el modal,
  // emite converted(factura) en éxito; formError en error, modal abierto
```

Inyecta `SeriesService`, filtra `series().filter(s => !s.esRectificativa)` —
misma regla que `FacturaFormModal`.

### `Presupuestos` (cambios)

```ts
@ViewChild(ConvertirAFacturaModal) convertirModal!: ConvertirAFacturaModal;

onConvertirAFactura(p: PresupuestoSummary): void
  // convertirModal.open(p.id)
  // visible solo si p.estado === Aceptado && p.facturaId === null
  // (PresupuestoSummary no trae facturaId hoy — se agrega al
  // PresupuestoSummaryDto del backend y a la interfaz TS)

onFacturaCreada(factura: Factura): void
  // this.router.navigate(['/facturas']);
```

**Cambio de DTO necesario:** `PresupuestoSummaryDto` no incluye hoy
`facturaId` (solo `PresupuestoDto` completo lo tiene). Se agrega al summary
y a su mapeo, porque el listado necesita saber si ya fue convertido sin pedir
el detalle completo de cada fila.

**Tabla de acciones actualizada** (reemplaza la de la spec de Presupuestos):

| Estado     | Botones                                          |
|------------|---------------------------------------------------|
| Borrador   | Editar, Enviar                                     |
| Enviado    | Aceptar, Rechazar                                  |
| Aceptado (sin facturaId) | Convertir a factura                  |
| Aceptado (con facturaId) | (ninguno)                             |
| Rechazado  | (ninguno)                                          |
| Caducado   | (ninguno)                                          |

`Presupuestos` inyecta `Router` (`inject(Router)` de `@angular/router`).

## Manejo de errores

Mismo patrón que Presupuestos: `extractErrorMessage(HttpErrorResponse)` +
signal `errorMessage` por servicio, mostrado en un banner en la parte
superior de cada pantalla; errores de modal van a `formError` local
(el modal permanece abierto).

Casos específicos:

- `POST /facturas` con serie rectificativa (400 nuevo) — bloqueado en el
  frontend (el `<select>` de serie ya filtra `!esRectificativa`), el mensaje
  del backend es el fallback si igual ocurre.
- `POST /facturas/{id}/marcar-cobrada` sobre una factura que no está
  `Emitida` (409) — el botón ya está oculto para esos casos; solo aparecería
  por condición de carrera entre pestañas.
- `POST /facturas/{id}/anular` sobre una ya anulada (409) — mismo caso,
  botón oculto salvo condición de carrera.
- `POST /facturas/{id}/rectificar` con serie no marcada `EsRectificativa`
  (400) — bloqueado en el frontend, mensaje del backend como fallback.
- `POST /presupuestos/{id}/convertir-a-factura` sobre un presupuesto no
  `Aceptado` o ya convertido (409) — botón oculto para esos casos salvo
  condición de carrera.

## Testing

Mismo patrón TDD que Presupuestos (Vitest en frontend, xUnit +
Testcontainers en backend), ejecutado vía `subagent-driven-development`.

**Backend (nuevo):**

- Test de integración para `POST /api/facturas`: alta exitosa asigna número
  correlativo correcto, rechaza cliente inexistente (400), rechaza serie
  rectificativa (400), rechaza sin líneas (400), calcula totales
  correctamente con líneas mixtas de IVA.
- Test de integración para `MarcarCobrada`: persiste `FechaCobro`
  correctamente (el bug que se corrige); rechaza si el estado no es
  `Emitida` (409, comportamiento ya existente, solo se re-verifica).

**Frontend:**

- `factura.models.ts`: completitud de `ESTADO_FACTURA_LABELS` respecto al
  enum (mismo test que Presupuestos para sus mapas).
- `facturas.service.spec.ts`: `load()` (con y sin `clienteId`), `getById()`,
  `create()`, `marcarCobrada()`, `anular()`, `rectificar()` — éxito y error
  cada uno; verificar recarga de lista tras cada mutación exitosa.
- `factura-form-modal.spec.ts`: validación de líneas (igual a Presupuestos),
  validación de rango de `porcentajeRetencionIrpf`, cálculo de `resumen()`
  con retención, filtro del `<select>` de serie (`!esRectificativa`), envío
  de `fechaVencimiento` como instante UTC o `null`.
- `factura-detalle-modal.spec.ts`: render de líneas y totales; nota de
  procedencia visible solo cuando corresponde.
- `marcar-cobrada-modal.spec.ts`: default de fecha = hoy; envío como
  instante UTC.
- `rectificar-modal.spec.ts`: precarga de líneas desde la factura original
  con `rowId` nuevos; filtro del `<select>` de serie (`esRectificativa`);
  validación de `motivo` no vacío.
- `facturas.spec.ts`: render de lista vacía vs con datos; filtros (cliente
  re-consulta backend, estado y número client-side); visibilidad condicional
  de botones según `estado` (tabla de arriba); `onAnular()` respeta
  `confirm()` cancelado.
- `presupuestos.service.spec.ts` (actualizar): `convertirAFactura()` — éxito
  recarga lista, error va a `errorMessage`.
- `convertir-a-factura-modal.spec.ts`: validación de serie/retención; filtro
  de serie `!esRectificativa`; emite `converted` con la factura creada.
- `presupuestos.spec.ts` (actualizar): botón "Convertir a factura" visible
  solo si `estado === Aceptado && facturaId === null`; `onFacturaCreada()`
  navega a `/facturas`.

**Verificación manual en navegador** (checklist final, mismo criterio que
Presupuestos): estado vacío del listado de Facturas; alta manual con líneas
mixtas de IVA y retención; validaciones cliente/serie/número/precio; marcar
cobrada con fecha; anular con confirmación; rectificar con líneas
precargadas y edición parcial; convertir un presupuesto Aceptado a factura
desde la pantalla de Presupuestos y verificar que navega a `/facturas` y que
el botón desaparece en Presupuestos; verificar que una factura con
`presupuestoOrigenId` o `facturaRectificadaId` muestra la nota de
procedencia en el detalle.

## Fuera de alcance (explícito)

- **Generación de PDF** (`Factura.PdfUrl`). Pendiente elegir librería
  (QuestPDF, iText, etc.) con el usuario — próximo ítem del roadmap después
  de Facturas, según `CONTINUAR-MODULO-FACTURACION.md`.
- **Edición de facturas.** No existe en el backend (inmutabilidad
  deliberada) y no se agrega en esta iteración.
- **Borrado de facturas.** El backend no expone `DELETE /api/facturas/{id}`.
- **Verifactu** (`HashRegistro`/`HashAnterior`, RD 1007/2023). Los campos
  existen en la entidad pero no se calculan; fuera de alcance de esta
  pantalla.
- **Validación fiscal del criterio anular-vs-rectificar.** El usuario decidió
  explícitamente exponer el botón "Anular" en esta iteración pese a la nota
  pendiente en `CONTINUAR-MODULO-FACTURACION.md` que sugería esperar
  confirmación de un asesor fiscal antes de hacerlo. Queda registrado acá
  como decisión consciente, no como omisión.
