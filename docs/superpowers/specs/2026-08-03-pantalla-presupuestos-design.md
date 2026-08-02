# Diseño: Pantalla de Presupuestos

Fecha: 2026-08-03

## Contexto

Tercera pantalla del módulo de facturación en el frontend, después de
Clientes (`44dbac6`) y Series (`9f7411d`, mergeada localmente, no pusheada
aún). Orden acordado: Clientes → Series → Presupuestos → Facturas.

`PresupuestosController` (backend, ya mergeado) expone `GET /api/presupuestos`,
`GET /api/presupuestos/{id}`, `POST /api/presupuestos`,
`PUT /api/presupuestos/{id}`, `POST /api/presupuestos/{id}/estado` y
`POST /api/presupuestos/{id}/convertir-a-factura`.

Presupuestos es bastante más complejo que Series: tiene líneas dinámicas
(N por presupuesto), un ciclo de estados (`Borrador → Enviado → Aceptado |
Rechazado`, más `Caducado`), edición restringida solo a `Borrador`, y una
conversión a Factura. Sigue las 3 convenciones fijadas por Series (ver su
spec): `output()` nativo, servicio completo expuesto al template, un signal
por campo de formulario escalar.

## Alcance

Incluye: listado, alta y edición de presupuestos con líneas dinámicas, y
cambio de estado (`Borrador → Enviado → Aceptado/Rechazado`) desde el
listado.

**Explícitamente fuera de alcance de esta iteración:** el botón "convertir a
factura" (`POST /presupuestos/{id}/convertir-a-factura`). Se implementa junto
con la pantalla de Facturas, porque requiere elegir una `Serie` y ver el
resultado (la Factura creada) — mezclar eso acá desenfocaría el spec.

## Detalle de serialización de enums (importante)

El backend **no** tiene `JsonStringEnumConverter` configurado (verificado en
`Program.cs` y en todo el proyecto — ningún `Converters`/`JsonOptions`). Los
enums de C# (`TipoLinea`, `TipoIva`, `EstadoPresupuesto`, `EstadoFactura`)
viajan como **números** (el índice de declaración), no como strings. El
frontend los modela como enums numéricos de TypeScript que replican
exactamente el orden del backend (`Data/Entities/FacturacionEnums.cs`), más
mapas de etiquetas para la UI:

```ts
export enum TipoLinea { ServicioPorHoras, ServicioPrecioFijo, Suscripcion, Producto }
export enum TipoIva { General21, Reducido10, Superreducido4, Exento }
export enum EstadoPresupuesto { Borrador, Enviado, Aceptado, Rechazado, Caducado }

export const TIPO_LINEA_LABELS: Record<TipoLinea, string> = {
  [TipoLinea.ServicioPorHoras]: 'Servicio por horas',
  [TipoLinea.ServicioPrecioFijo]: 'Servicio a precio fijo',
  [TipoLinea.Suscripcion]: 'Suscripción',
  [TipoLinea.Producto]: 'Producto',
};

export const TIPO_IVA_LABELS: Record<TipoIva, string> = {
  [TipoIva.General21]: 'IVA general (21%)',
  [TipoIva.Reducido10]: 'IVA reducido (10%)',
  [TipoIva.Superreducido4]: 'IVA superreducido (4%)',
  [TipoIva.Exento]: 'Exento de IVA',
};

export const TIPO_IVA_PORCENTAJE: Record<TipoIva, number> = {
  [TipoIva.General21]: 21,
  [TipoIva.Reducido10]: 10,
  [TipoIva.Superreducido4]: 4,
  [TipoIva.Exento]: 0,
};

export const ESTADO_PRESUPUESTO_LABELS: Record<EstadoPresupuesto, string> = {
  [EstadoPresupuesto.Borrador]: 'Borrador',
  [EstadoPresupuesto.Enviado]: 'Enviado',
  [EstadoPresupuesto.Aceptado]: 'Aceptado',
  [EstadoPresupuesto.Rechazado]: 'Rechazado',
  [EstadoPresupuesto.Caducado]: 'Caducado',
};
```

Si el backend alguna vez agrega `JsonStringEnumConverter`, estos mapas y los
`Record<Enum, T>` seguirían funcionando (las claves numéricas de TS siguen
siendo válidas), pero los valores recibidos del backend pasarían a ser
strings y habría que ajustar el tipo de las interfaces `Presupuesto`/
`LineaPresupuesto`. No es una preocupación de esta iteración.

## Archivos

Nuevo modelo en `core/models/presupuesto.models.ts`:

```ts
export interface LineaPresupuesto {
  id: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface Presupuesto {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  fechaValidez: string | null;
  notas: string | null;
  facturaId: string | null;
  lineas: LineaPresupuesto[];
  createdAt: string;
  updatedAt: string;
}

export interface PresupuestoSummary {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  numeroLineas: number;
}

export interface LineaPresupuestoRequest {
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface CreatePresupuestoRequest {
  clienteId: string;
  numero: string;
  fechaValidez: string | null;
  notas: string | null;
  lineas: LineaPresupuestoRequest[];
}

export interface UpdatePresupuestoRequest {
  fechaValidez: string | null;
  notas: string | null;
  lineas: LineaPresupuestoRequest[];
}
```

En `frontend/src/app/features/presupuestos/`:

- `presupuestos.service.ts` + `.spec.ts`
- `presupuesto-form-modal.ts` + `.html` + `.css` + `.spec.ts`
- `presupuestos.ts` + `.html` + `.css` + `.spec.ts`

## Componentes

### `PresupuestosService`

Mismo patrón que `ClientesService`, con `cambiarEstado` en vez de `remove`:

```ts
readonly presupuestos = signal<PresupuestoSummary[]>([]);
readonly isLoading = signal(false);
readonly errorMessage = signal<string | null>(null);

async load(): Promise<void>
  // GET /api/presupuestos

async create(request: CreatePresupuestoRequest): Promise<Presupuesto>
  // POST /api/presupuestos, luego await this.load()

async update(id: string, request: UpdatePresupuestoRequest): Promise<Presupuesto>
  // PUT /api/presupuestos/{id}, luego await this.load()

async cambiarEstado(id: string, estado: EstadoPresupuesto): Promise<void>
  // POST /api/presupuestos/{id}/estado { estado }, luego await this.load()
  // errores (409) van a errorMessage, no se relanzan
```

### `PresupuestoFormModal`

Alta y edición en un solo modal, como `ClienteFormModal`, pero con:

- Cliente y Número **deshabilitados en modo edición** (el backend no los
  acepta en `UpdatePresupuestoRequest` — cambiarlos sería un no-op silencioso
  si se mandaran, así que se deshabilitan en la UI para no confundir).
- Un array de líneas en vez de campos escalares.
- Inyecta `ClientesService` directamente (igual que inyecta `SeriesService`
  en su propio caso de uso) para poblar el `<select>` de cliente con
  `clientesService.clientes()`. No vuelve a llamar `load()` — confía en que
  el listado (`Presupuestos.ngOnInit`) ya lo hizo antes de que el usuario
  pueda abrir el modal; al ser un servicio singleton (`@Service()`), el
  signal `clientes` ya está poblado.

```ts
interface LineaFormRow {
  rowId: string;               // crypto.randomUUID(), solo para track() — no se envía
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number | null;     // null = input vacío (Angular no emite NaN)
  precioUnitario: number | null;
  tipoIva: TipoIva;
}

readonly saved = output<void>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);

readonly editingId = signal<string | null>(null);
readonly clienteId = signal('');
readonly numero = signal('');
readonly fechaValidez = signal('');       // input type="date", string vacío = sin valor
readonly notas = signal('');
readonly lineas = signal<LineaFormRow[]>([]);

readonly resumen = computed(() => {
  let subtotal = 0;
  const ivaPorTipo = new Map<TipoIva, number>();
  for (const l of this.lineas()) {
    const importe = (l.cantidad ?? 0) * (l.precioUnitario ?? 0);
    subtotal += importe;
    const iva = importe * (TIPO_IVA_PORCENTAJE[l.tipoIva] / 100);
    ivaPorTipo.set(l.tipoIva, (ivaPorTipo.get(l.tipoIva) ?? 0) + iva);
  }
  const totalIva = [...ivaPorTipo.values()].reduce((a, b) => a + b, 0);
  return { subtotal, ivaPorTipo, totalIva, total: subtotal + totalIva };
});

openForCreate(): void
  // editingId.set(null); resetForm(); primera línea vacía añadida por defecto

openForEdit(presupuesto: Presupuesto): void
  // editingId.set(presupuesto.id); precarga todos los campos + lineas
  // (mapeando LineaPresupuesto -> LineaFormRow con rowId nuevo)

addLinea(): void
  // lineas.update(rows => [...rows, filaVacia()])

removeLinea(rowId: string): void
  // lineas.update(rows => rows.filter(r => r.rowId !== rowId))

updateLinea(rowId: string, patch: Partial<LineaFormRow>): void
  // lineas.update(rows => rows.map(r => r.rowId === rowId ? { ...r, ...patch } : r))

cancel(): void
async onSubmit(): Promise<void>
```

**Validación de `onSubmit()`** (bloquea antes de llamar al backend):

1. Modo alta: `clienteId` no vacío, `numero.trim()` no vacío.
2. `lineas().length > 0` — si no, `formError = 'El presupuesto debe tener al
   menos una línea.'`.
3. Por cada línea (índice 1-based en el mensaje de error):
   - `descripcion.trim()` no vacía →
     `'Línea N: la descripción es obligatoria.'`.
   - `cantidad` coercionado con `Number(...)`: debe ser finito y `> 0` →
     `'Línea N: la cantidad debe ser mayor que 0.'`.
   - `precioUnitario` coercionado: debe ser finito y `>= 0` →
     `'Línea N: el precio unitario no puede ser negativo.'`.
4. Si todo pasa: arma `lineas` del request con `orden` = índice+1 en el array
   final, llama a `create()` o `update()` según `editingId()`, cierra el
   modal y emite `saved` en éxito; en error, `formError` vía
   `extractErrorMessage` y el modal permanece abierto.

### `Presupuestos` (listado)

```ts
protected readonly presupuestosService = inject(PresupuestosService);
protected readonly clientesService = inject(ClientesService);
@ViewChild(PresupuestoFormModal) modal!: PresupuestoFormModal;

ngOnInit(): void
  // void this.presupuestosService.load();
  // void this.clientesService.load();

nombreCliente(clienteId: string): string
  // busca en clientesService.clientes(), fallback '—'

onNew(): void // this.modal.openForCreate();
onEdit(p: PresupuestoSummary): Promise<void>
  // pide el detalle completo vía GET /api/presupuestos/{id} (el summary no
  // trae las líneas) y recién ahí abre el modal con openForEdit(detalle)

async onEnviar(p: PresupuestoSummary): Promise<void>
  // cambiarEstado(p.id, EstadoPresupuesto.Enviado), sin confirm()

async onAceptar(p: PresupuestoSummary): Promise<void>
  // cambiarEstado(p.id, EstadoPresupuesto.Aceptado), sin confirm()

async onRechazar(p: PresupuestoSummary): Promise<void>
  // confirm('¿Rechazar el presupuesto NUMERO?') antes de cambiarEstado(...)

onSaved(): void // no-op, mismo patrón que Clientes/Series
```

`onEdit` necesita el detalle completo (con líneas), que el listado no tiene
porque usa `PresupuestoSummaryDto`. Se agrega un método `getById(id)` al
servicio:

```ts
async getById(id: string): Promise<Presupuesto>
  // GET /api/presupuestos/{id}, no toca los signals del servicio
```

**Plantilla:** tabla con columnas Número, Cliente (vía `nombreCliente()`),
Estado (etiqueta de `ESTADO_PRESUPUESTO_LABELS`), Fecha emisión, Nº líneas,
acciones. Sin búsqueda/filtro (igual que Series).

**Acciones por fila**, condicionadas al `estado`:

| Estado     | Botones                        |
|------------|---------------------------------|
| Borrador   | Editar, Enviar                  |
| Enviado    | Aceptar, Rechazar                |
| Aceptado   | (ninguno — conversión a factura fuera de alcance) |
| Rechazado  | (ninguno)                        |
| Caducado   | (ninguno)                        |

### Ruteo y navegación

Añadir a `app.routes.ts`: `{ path: 'presupuestos', component: Presupuestos }`
dentro del grupo con `Layout`/`authGuard`, junto a `clientes` y `series`.
Añadir el link correspondiente en `shared/layout/layout.html` (mismo lugar
que los links existentes de `/clientes` y `/series`).

## Manejo de errores

- Fallo al cargar listado (Presupuestos o Clientes) → `errorMessage` del
  servicio respectivo, mostrado en la plantilla.
- `POST /presupuestos` con cliente inexistente (400) — no debería ocurrir en
  la práctica (el dropdown solo lista clientes reales), pero el mensaje del
  backend se muestra igual como fallback si ocurre.
- `POST /presupuestos` o `PUT .../{id}` sin líneas (400) — bloqueado ya en el
  frontend (regla 2 de validación), pero el mensaje del backend cubre el caso
  de que algo se escape.
- `PUT /presupuestos/{id}` sobre un presupuesto no-Borrador (409) — el botón
  "Editar" ya está oculto para esos casos; este error solo aparecería por una
  condición de carrera (otra pestaña/usuario cambió el estado entre la carga
  de la lista y la apertura del modal). Se muestra en `formError` igual que
  cualquier otro error, el modal queda abierto.
- `POST /presupuestos/{id}/estado` sobre un presupuesto ya convertido a
  factura (409) — no debería ocurrir en esta iteración (sin botón de
  conversión todavía), pero si ocurre (dato de una sesión futura, por
  ejemplo) se muestra en `presupuestosService.errorMessage`.

## Testing (Vitest, mismo patrón que Clientes/Series)

- **`presupuesto.models.ts`**: los mapas `TIPO_LINEA_LABELS`,
  `TIPO_IVA_LABELS`, `TIPO_IVA_PORCENTAJE`, `ESTADO_PRESUPUESTO_LABELS` tienen
  una entrada por cada valor del enum correspondiente (test de completitud,
  no de valores — evita que un enum nuevo en el backend quede sin etiqueta).
- **`presupuestos.service.spec.ts`**: `load()`, `create()`, `update()`,
  `cambiarEstado()`, `getById()` — éxito y error cada uno; verificar que
  `create()`/`update()`/`cambiarEstado()` recargan la lista tras éxito, y que
  `getById()` NO toca los signals del servicio.
- **`presupuesto-form-modal.spec.ts`**:
  - `openForCreate()`: campos vacíos, cliente/número habilitados, una línea
    vacía por defecto.
  - `openForEdit()`: precarga de todos los campos y líneas; cliente/número
    deshabilitados.
  - `addLinea()`/`removeLinea()`/`updateLinea()`: mutan el array
    correctamente, `rowId` estable para filas no tocadas.
  - Validación: sin líneas, línea con descripción vacía, línea con cantidad
    vacía/0/negativa, línea con precio negativo — cada caso setea el
    `formError` esperado y NO llama al servicio.
  - `resumen()`: caso con una sola línea; caso con líneas de distinto
    `TipoIva` (verifica desglose por tipo); caso con `cantidad`/
    `precioUnitario` en `null` (no debe arrojar `NaN`).
  - Submit exitoso en alta llama a `create()`; en edición llama a
    `update(editingId)`; ambos emiten `saved` y cierran el modal.
  - `formError` seteado en fallo del backend (400/409), modal permanece
    abierto.
- **`presupuestos.spec.ts`**: render de lista vacía vs con datos;
  `nombreCliente()` resuelve nombre o `'—'`; visibilidad condicional de
  botones según `estado` (tabla de la sección de arriba); `onEdit()` llama a
  `getById()` antes de abrir el modal; `onRechazar()` respeta `confirm()`
  cancelado (no llama a `cambiarEstado`); `ngOnInit()` dispara `load()` en
  ambos servicios. Sigue la excepción ya documentada para Clientes/Series
  sobre `fixture.detectChanges()` alrededor de la limitación de jsdom con
  `HTMLDialogElement.showModal()/close()`.

## Fuera de alcance (explícito)

- Botón/flujo de "convertir a factura" (`POST
  /presupuestos/{id}/convertir-a-factura`) — se hace junto con la pantalla de
  Facturas.
- Búsqueda/filtro en el listado de presupuestos.
- Borrado de presupuestos (el backend no expone `DELETE
  /api/presupuestos/{id}`).
- Transiciones de estado no cubiertas por los botones de la tabla (ej. volver
  de `Rechazado` a `Borrador`, marcar `Caducado` manualmente) — el backend
  técnicamente las permitiría vía el mismo endpoint genérico de estado, pero
  no se exponen en esta UI.
- Cualquier cambio al `PresupuestosController` o sus DTOs.
