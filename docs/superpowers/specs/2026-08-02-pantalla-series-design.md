# Diseño: Pantalla de Series

Fecha: 2026-08-02

## Contexto

Segunda pantalla del módulo de facturación en el frontend, después de Clientes
(mergeada en `44dbac6`). Orden acordado: Series → Presupuestos → Facturas,
porque Series es la más simple y Facturas la necesita (vía
`POST /api/presupuestos/{id}/convertir-a-factura`).

Antes de construir esta pantalla se decidieron 3 convenciones de casa que
quedaron pendientes de la revisión final de la rama de Clientes, para
aplicarlas consistentemente en Series, Presupuestos y Facturas:

1. **`output()` nativo de Angular 22** en vez de `@Output() = new EventEmitter()`.
   Clientes usa `@Output`; las pantallas nuevas usan `output()`. No se
   retrofitea Clientes.
2. **Exponer el servicio completo al template** (`protected readonly
   xxxService = inject(...)`), igual que hace Clientes — no re-exponer cada
   signal individualmente como `search-history`/`business-search`.
3. **Un signal por campo de formulario** (igual que `cliente-form-modal.ts`),
   no un único `signal<FormValue>` objeto. Aceptado pese a la duplicación que
   generó en Clientes porque el formulario de Series es pequeño (4 campos).

## Alcance

`SeriesController` (backend, ya mergeado) solo expone `GET /api/series` y
`POST /api/series` — deliberadamente sin `PUT`/`DELETE`, por motivos fiscales
(numeración correlativa de una serie no debería editarse ni borrarse
libremente). Decisión de esta sesión: **no tocar el backend, la pantalla de
Series es solo listado + alta.** Sin edición, sin borrado.

Tampoco hay búsqueda/filtro: las series son pocas (una o dos por año), y el
backend ya las devuelve ordenadas (Año desc, Código asc). Un listado simple
es suficiente.

## Archivos

En `frontend/src/app/features/series/`:

- `series.service.ts` + `series.service.spec.ts`
- `serie-form-modal.ts` + `.html` + `.css` + `.spec.ts`
- `series.ts` + `.html` + `.css` + `.spec.ts`

Nuevo modelo en `core/models/serie.models.ts`: `Serie`, `CreateSerieRequest`
(reflejando `SerieDto`/`CreateSerieRequest` del backend: `Codigo`,
`Descripcion?`, `Anio`, `EsRectificativa`, más `Id` y `UltimoNumero` en la
respuesta).

## Componentes

### `SeriesService`

Mismo patrón que `ClientesService` pero sin `update`/`remove`:

```ts
readonly series = signal<Serie[]>([]);
readonly isLoading = signal(false);
readonly errorMessage = signal<string | null>(null);

async load(): Promise<void> // GET /api/series, llena `series` o `errorMessage`
async create(request: CreateSerieRequest): Promise<Serie>
  // POST /api/series, luego await this.load() para refrescar la lista
```

### `SerieFormModal`

Solo alta — sin `editingId` ni `openForEdit`:

```ts
readonly saved = output<void>();
readonly isSaving = signal(false);
readonly formError = signal<string | null>(null);

readonly codigo = signal('');
readonly descripcion = signal('');
readonly anio = signal(new Date().getFullYear()); // precargado al abrir
readonly esRectificativa = signal(false);

openForCreate(): void // resetForm() + showModal()
cancel(): void // dialogEl.close()
async onSubmit(): Promise<void>
  // valida codigo no vacío -> formError si falta
  // POST vía SeriesService.create(); onSuccess: close() + saved.emit()
  // onError: formError.set(extractErrorMessage(error)) — cubre 400 (código
  // vacío, validado también en backend) y 409 (código+año duplicado)
```

### `Series` (listado)

```ts
protected readonly seriesService = inject(SeriesService);
@ViewChild(SerieFormModal) modal!: SerieFormModal;

ngOnInit(): void // void this.seriesService.load();
onNew(): void // this.modal.openForCreate();
onSaved(): void // no-op, mismo comentario que Clientes.onSaved()
```

Plantilla: tabla/lista con columnas Código, Descripción, Año, Rectificativa
(sí/no), Último número. Sin acciones de fila (no hay editar/borrar). Botón
"Nueva serie" que abre el modal.

### Ruteo y navegación

Añadir a `app.routes.ts`: `{ path: 'series', component: Series }` dentro del
grupo con `Layout`/`authGuard`. Añadir el link correspondiente en
`shared/layout/layout.html`, igual que se hizo para `clientes`.

## Manejo de errores

- Fallo al cargar el listado → `errorMessage` del servicio, mostrado en la
  plantilla.
- Fallo al crear (400 código vacío, 409 duplicado código+año, u otro) →
  `formError` en el modal vía `extractErrorMessage`; el modal permanece
  abierto para que el usuario corrija.
- No hay caso de "409 por relación existente" como en el borrado de
  Clientes — no aplica porque no hay borrado.

## Testing (Vitest, mismo patrón que Clientes)

- `series.service.spec.ts`: `load()` éxito/error; `create()` éxito/400/409;
  verificar que `create()` recarga la lista tras crear.
- `serie-form-modal.spec.ts`: validación de código vacío; año por defecto =
  año actual al llamar `openForCreate()`; emisión de `saved` tras éxito;
  `formError` seteado en fallo del backend; `resetForm()` limpia el
  formulario entre aperturas.
- `series.spec.ts`: render de lista vacía vs con datos; `onNew()` abre el
  modal; `ngOnInit()` dispara `load()`. Sigue la excepción ya documentada
  para Clientes sobre `fixture.detectChanges()` alrededor de la limitación
  de jsdom con `HTMLDialogElement.showModal()/close()`.

## Fuera de alcance (explícito)

- Editar o borrar series (el backend no lo soporta; decisión deliberada).
- Búsqueda/filtro en el listado.
- Cualquier cambio al `SeriesController` o su DTOs.
