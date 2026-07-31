# Pantalla de Clientes (frontend Angular) — Diseño

## Contexto

El backend del módulo de facturación (`ClientesController`, `Dtos/Clientes/ClienteDtos.cs`)
ya expone CRUD completo sobre `/api/clientes`:

- `GET /api/clientes` — lista los clientes del usuario autenticado, ordenados por nombre.
- `GET /api/clientes/{id}` — detalle.
- `POST /api/clientes` — alta (`CreateClienteRequest`).
- `PUT /api/clientes/{id}` — edición (`UpdateClienteRequest`).
- `DELETE /api/clientes/{id}` — baja; devuelve `409 Conflict` con
  `{ message: "No se puede eliminar un cliente con facturas o presupuestos asociados." }`
  si el cliente tiene facturas o presupuestos vinculados.

El frontend (`remix-of-remix-of-local-spark/frontend`) es Angular 22 standalone,
con signals, Tailwind, y sin router reactivo de formularios (usa `FormsModule` +
`ngModel`). No existe todavía ninguna pantalla para clientes ni ningún componente
de modal/diálogo en el proyecto.

Este spec cubre únicamente la pantalla de **Clientes** (listado + alta/edición/baja).
Presupuestos y Facturas quedan fuera de este alcance — se abordarán en specs
posteriores.

## Convenciones existentes a seguir

- Componentes standalone, un feature por carpeta bajo `src/app/features/`,
  con `.ts` + `.html` + `.css` + `.spec.ts` separados (ver `business-search/`).
- Estado en signals dentro de un `Service` inyectable (`isLoading`, `errorMessage`,
  datos), expuesto como `readonly` al componente.
- Peticiones HTTP con `HttpClient` + `firstValueFrom`, errores capturados con
  `extractErrorMessage()` de `core/http-error.util.ts` (no se toca).
- Modelos de datos en `core/models/*.models.ts`.
- Tailwind utility classes inline, sin sistema de diseño adicional.
- Rutas protegidas anidadas bajo `Layout` con `authGuard` en `app.routes.ts`.

## Archivos nuevos

```
frontend/src/app/core/models/cliente.models.ts
frontend/src/app/features/clientes/clientes.service.ts
frontend/src/app/features/clientes/clientes.service.spec.ts
frontend/src/app/features/clientes/clientes.ts
frontend/src/app/features/clientes/clientes.html
frontend/src/app/features/clientes/clientes.css
frontend/src/app/features/clientes/clientes.spec.ts
frontend/src/app/features/clientes/cliente-form-modal.ts
frontend/src/app/features/clientes/cliente-form-modal.html
frontend/src/app/features/clientes/cliente-form-modal.css
frontend/src/app/features/clientes/cliente-form-modal.spec.ts
```

Modificados:

```
frontend/src/app/app.routes.ts   (agrega ruta 'clientes')
frontend/src/app/shared/layout/layout.html  (agrega link "Clientes")
```

## Modelos (`cliente.models.ts`)

Mapea 1:1 los DTOs de `ClienteDtos.cs`:

```ts
export interface Cliente {
  id: string;
  nombre: string;
  nif: string;
  direccion: string;
  codigoPostal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string;
  email: string | null;
  telefono: string | null;
  esAutonomoOProfesional: boolean;
  createdAt: string;
}

export type CreateClienteRequest = Omit<Cliente, 'id' | 'createdAt' | 'pais'> & { pais?: string | null };
export type UpdateClienteRequest = CreateClienteRequest;
```

## `ClientesService`

Signals: `clientes = signal<Cliente[]>([])`, `isLoading = signal(false)`,
`errorMessage = signal<string | null>(null)`.

Métodos (todos async, mismo patrón try/catch/finally que `BusinessSearchService`):

- `load(): Promise<void>` — `GET /api/clientes`, llena `clientes`.
- `create(request: CreateClienteRequest): Promise<Cliente>` — `POST`, y al resolver
  vuelve a llamar `load()` para refrescar `clientes` (más simple que mergear
  localmente, y consistente con el volumen esperado de clientes por usuario).
- `update(id: string, request: UpdateClienteRequest): Promise<Cliente>` — `PUT`,
  también recarga con `load()` al resolver.
- `remove(id: string): Promise<void>` — `DELETE`, recarga. Si falla con 409, `errorMessage` queda seteado con el mensaje del backend y **no** se limpia la lista.

Errores de `create`/`update`/`remove` se relanzan después de setear `errorMessage`,
para que el componente que llama sepa si debe mantener el modal abierto.

## `Clientes` (componente principal)

- Implementa `OnInit`; en `ngOnInit()` llama `void this.clientesService.load()`
  (mismo patrón que `SearchHistory.ngOnInit()`).
- Signal local `searchTerm = signal('')`.
- `computed` `filteredClientes` sobre `clientesService.clientes()` filtrando por
  `nombre` o `nif` (case-insensitive, `includes`), solo si `searchTerm()` no está vacío.
- Tabla con columnas: **Nombre, NIF, Email, Teléfono**, y una columna de acciones
  con botones "Editar" y "Eliminar" por fila.
- Botón "Nuevo cliente" arriba de la tabla, abre el modal en modo alta.
- `@ViewChild(ClienteFormModal) modal!: ClienteFormModal` — referencia directa al
  modal para invocar sus métodos públicos `open()`/`openForEdit()`.
- `onEdit(cliente)`: `this.modal.openForEdit(cliente)`.
- `onNew()`: `this.modal.openForCreate()`.
- `onDelete(cliente)`: `confirm('¿Eliminar a ' + cliente.nombre + '?')` nativo; si
  confirma, llama `clientesService.remove(cliente.id)`. El error 409 se muestra vía
  `clientesService.errorMessage()` renderizado en la pantalla principal (no en el modal).
- `onSaved()` (evento emitido por el modal tras un guardado exitoso): no necesita
  cerrar el modal — el propio modal se cierra a sí mismo (`dialogEl.nativeElement.close()`)
  antes de emitir `saved`. El handler del padre solo necesita refrescar si hiciera
  falta (no hace falta: `clientesService.create()/update()` ya recargan la lista).

## `ClienteFormModal` (componente modal)

- Usa `<dialog>` nativo con `@ViewChild('dialogEl') private dialogEl!: ElementRef<HTMLDialogElement>`.
- Estado interno: `editingCliente = signal<Cliente | null>(null)` (null = modo alta)
  y los signals de campos del formulario (o un solo `signal` de tipo `CreateClienteRequest`
  editado con `ngModel`, poblado desde `editingCliente()` al abrir).
- Métodos públicos invocados por el padre vía `@ViewChild`:
  - `openForCreate(): void` — resetea el formulario a valores vacíos (país
    default "España"), `editingCliente.set(null)`, `dialogEl.nativeElement.showModal()`.
  - `openForEdit(cliente: Cliente): void` — precarga el formulario con `cliente`,
    `editingCliente.set(cliente)`, `dialogEl.nativeElement.showModal()`.
- `@Output() saved = new EventEmitter<void>()`.
- Formulario con `FormsModule`/`ngModel` (no reactive forms, siguiendo la convención
  existente), campos: Nombre*, NIF*, Dirección*, Código Postal, Ciudad, Provincia,
  País (default "España"), Email, Teléfono, checkbox "Autónomo o profesional".
  Campos marcados con * son obligatorios (validación mínima: no vacíos, igual que
  hace el backend).
- Botón "Guardar": arma el request, llama `clientesService.create()` o `.update()`
  según haya o no `cliente` de entrada. Si resuelve OK, emite `saved`. Si falla,
  muestra `clientesService.errorMessage()` **dentro del modal** (para errores de
  validación al guardar; distinto del error de borrado que se muestra en la pantalla
  principal).
- Botón "Cancelar": cierra el modal sin guardar, sin emitir `saved`.

## Ruteo y navegación

- `app.routes.ts`: agrega `{ path: 'clientes', component: Clientes }` dentro del
  array `children` del bloque protegido por `authGuard`.
- `layout.html`: agrega un link `routerLink="/clientes"` junto a los existentes
  (Buscar, Historial, Sitios), mismo estilo (`routerLinkActive="text-slate-900"`).

## Manejo de errores

- Reutiliza `extractErrorMessage()` tal cual, sin modificarlo.
- Dos "slots" de error distintos en pantalla: uno en el modal (errores de
  create/update) y uno en la pantalla principal (error de load/remove, en particular
  el 409 de borrado con facturas/presupuestos asociados).

## Testing

Un `.spec.ts` por archivo nuevo, con vitest (patrón ya usado en el proyecto):

- `clientes.service.spec.ts`: mockea `HttpClient`, verifica `load/create/update/remove`
  actualizan los signals correctamente y que `remove` ante un 409 deja `errorMessage`
  seteado sin vaciar `clientes`.
- `clientes.spec.ts`: renderiza el componente, verifica que la tabla muestra los
  clientes cargados, que el filtro de búsqueda funciona, y que "Nuevo cliente"/"Editar"
  abren el modal con los datos correctos.
- `cliente-form-modal.spec.ts`: verifica modo alta vs. edición (precarga de campos),
  que "Guardar" llama al método correcto del servicio, y que un error de backend se
  muestra sin cerrar el modal.

## Fuera de alcance

- Pantallas de Series, Presupuestos y Facturas (specs separados).
- Generación de PDF.
- Endpoint de anulación de facturas (pendiente de confirmación fiscal, según nota
  en `CONTINUAR-MODULO-FACTURACION.md`).
