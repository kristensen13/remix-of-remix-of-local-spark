# Pantalla de Presupuestos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Presupuestos screen (list, create/edit with dynamic líneas, and estado transitions) in the Angular frontend, consuming the existing `PresupuestosController` backend (`GET/POST /api/presupuestos`, `GET/PUT /api/presupuestos/{id}`, `POST /api/presupuestos/{id}/estado`).

**Architecture:** A `PresupuestosService` holds signal-based state (`presupuestos`, `isLoading`, `errorMessage`) plus a non-state `getById()` lookup, and talks to `/api/presupuestos` via `HttpClient`. A `Presupuestos` list component renders an unfiltered table, cross-referencing `ClientesService` to resolve cliente names, and exposes contextual estado-transition buttons per row. A `PresupuestoFormModal` component (built on the native `<dialog>` element, same pattern as `SerieFormModal`/`ClienteFormModal`) handles both create and edit, managing a dynamic array of línea rows as a single array signal (not one signal per línea field — the "one signal per form field" convention applies to the modal's scalar fields, not to the dynamic array) and computing a live subtotal/IVA/total summary. This is the third of three new screens (Clientes → Series → Presupuestos → Facturas) and follows the two conventions Series fixed: `output()` and full-service-injection. The screen is added as a new protected route with a nav link.

**Tech Stack:** Angular 22 standalone components, signals, `computed()`, `output()`, `FormsModule`/`ngModel` (including `ngValue` for non-string option bindings), Tailwind utility classes, Vitest (`@angular/build:unit-test`), native `HTMLDialogElement`, `crypto.randomUUID()`.

**Spec:** `docs/superpowers/specs/2026-08-03-pantalla-presupuestos-design.md`

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill (`feature/pantalla-presupuestos`) at execution time.

## Global Constraints

- Follow existing project conventions exactly: standalone components, one folder per feature under `src/app/features/`, `.ts` + `.html` + `.css` + `.spec.ts` split into separate files (never inline templates/styles).
- State lives in signals inside an injectable service (`@Service()` decorator — this project's alias for `@Injectable()`), exposed as `readonly` to components.
- HTTP calls use `HttpClient` + `firstValueFrom` (no `.subscribe()`).
- Errors are formatted with the existing `extractErrorMessage()` from `core/http-error.util.ts` — do not modify that file.
- Forms use `FormsModule` + `[ngModel]`/`(ngModelChange)` two-way binding (banana-in-a-box), never Reactive Forms. Use `[ngValue]` (not `[value]`) on `<option>` elements bound to non-string data (enum numbers, or the "no selection" empty case) — `[value]` coerces to a string and would silently break the numeric-enum contract with the backend.
- Tailwind utility classes inline in templates; no new CSS framework or component library.
- No new npm dependencies.
- New routes nest under the existing `Layout` component, guarded by `authGuard`, inside `app.routes.ts`.
- Component outputs use the native `output()` function (`readonly saved = output<void>();`), not `@Output() = new EventEmitter()` (convention fixed by Series).
- The list component injects and exposes the whole service to the template (`protected readonly presupuestosService = inject(PresupuestosService);`), not re-exposing individual signals (convention fixed by Series). The `Presupuestos` list component additionally injects `ClientesService` the same way, to resolve cliente names.
- **Backend enums serialize as numbers, not strings.** `PresupuestosController`/`Program.cs` have no `JsonStringEnumConverter` configured anywhere in the backend. `TipoLinea`, `TipoIva`, and `EstadoPresupuesto` must be modeled as TypeScript numeric enums whose member order exactly matches `backend/LocaleBoost.Api/Data/Entities/FacturacionEnums.cs`:
  ```csharp
  public enum TipoLinea { ServicioPorHoras, ServicioPrecioFijo, Suscripcion, Producto }
  public enum TipoIva { General21, Reducido10, Superreducido4, Exento }
  public enum EstadoPresupuesto { Borrador, Enviado, Aceptado, Rechazado, Caducado }
  ```
- Angular emits `null` (not `NaN`) when a `type="number"` input is cleared, and this project's `tsconfig.json` does not have `strict`/`strictTemplates` on, so a `number`-typed signal will not catch this at compile time (lesson from Series' final review — see its plan/spec). Apply explicit `Number(...)` coercion + range validation in `onSubmit()` for every numeric línea field (`cantidad`, `precioUnitario`) from the start, not as a follow-up fix.
- **jsdom in this project does not implement `HTMLDialogElement.showModal()`/`close()`.** Any component that calls these methods must expose the `ElementRef` as a normal (non-`private`) `@ViewChild` so tests can replace it with a `{ nativeElement: { showModal: vi.fn(), close: vi.fn() } }` stub — do not attempt to render the real dialog in tests.
- Existing component tests in this codebase never call `fixture.detectChanges()` except where explicitly rendering the DOM tree (see Clientes'/Series' "template rendering" describe blocks) — construct components with `TestBed.createComponent(X).componentInstance` and assign `@ViewChild` references / stub services by hand otherwise.
- `PresupuestosController` exposes `GET/POST /api/presupuestos`, `GET/PUT /api/presupuestos/{id}`, `POST /api/presupuestos/{id}/estado`, and `POST /api/presupuestos/{id}/convertir-a-factura`. **Do not add the "convertir a factura" button/flow in this plan** — it belongs with the Facturas screen (separate spec/plan), because it needs to select a `Serie` and show the resulting Factura. Do not touch the backend controller or its DTOs.
- Out of scope (see spec): search/filter on the list, deleting presupuestos (no `DELETE` endpoint exists), estado transitions not covered by the row buttons (e.g. manually setting `Caducado`), PDF generation, the anulación endpoint, the Facturas screen.
- Run tests from `frontend/` with `npm test` (runs once, not in watch mode — confirmed: **19 files / 92 tests** pass on the current baseline before this plan's changes).

---

### Task 1: Presupuesto models + PresupuestosService

**Files:**
- Create: `frontend/src/app/core/models/presupuesto.models.ts`
- Create: `frontend/src/app/core/models/presupuesto.models.spec.ts`
- Create: `frontend/src/app/features/presupuestos/presupuestos.service.ts`
- Create: `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts`

**Interfaces:**
- Consumes: nothing new (only `HttpClient`, `extractErrorMessage` from `core/http-error.util.ts`).
- Produces (used by Tasks 2 and 3):
  - `TipoLinea`, `TipoIva`, `EstadoPresupuesto` numeric enums; `TIPO_LINEA_LABELS`, `TIPO_IVA_LABELS`, `TIPO_IVA_PORCENTAJE`, `ESTADO_PRESUPUESTO_LABELS` label/lookup maps.
  - `LineaPresupuesto`, `Presupuesto`, `PresupuestoSummary`, `LineaPresupuestoRequest`, `CreatePresupuestoRequest`, `UpdatePresupuestoRequest` interfaces (shapes below).
  - `PresupuestosService` — `presupuestos: Signal<PresupuestoSummary[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `load(): Promise<void>`, `create(request: CreatePresupuestoRequest): Promise<Presupuesto>`, `update(id: string, request: UpdatePresupuestoRequest): Promise<Presupuesto>`, `cambiarEstado(id: string, estado: EstadoPresupuesto): Promise<void>` (catches its own errors into `errorMessage`, never rejects), `getById(id: string): Promise<Presupuesto>` (does not touch the service's signals, lets errors propagate to the caller).

- [ ] **Step 1: Write the model file**

```typescript
// frontend/src/app/core/models/presupuesto.models.ts
export enum TipoLinea {
  ServicioPorHoras,
  ServicioPrecioFijo,
  Suscripcion,
  Producto,
}

export enum TipoIva {
  General21,
  Reducido10,
  Superreducido4,
  Exento,
}

export enum EstadoPresupuesto {
  Borrador,
  Enviado,
  Aceptado,
  Rechazado,
  Caducado,
}

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

- [ ] **Step 2: Write the failing tests for the label/lookup maps**

```typescript
// frontend/src/app/core/models/presupuesto.models.spec.ts
import {
  EstadoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  TIPO_IVA_LABELS,
  TIPO_IVA_PORCENTAJE,
  TIPO_LINEA_LABELS,
  TipoIva,
  TipoLinea,
} from './presupuesto.models';

function numericValues<T extends Record<string, string | number>>(enumObj: T): number[] {
  return Object.values(enumObj).filter((v): v is number => typeof v === 'number');
}

describe('presupuesto.models label maps', () => {
  it('TIPO_LINEA_LABELS has a non-empty entry for every TipoLinea value', () => {
    for (const value of numericValues(TipoLinea)) {
      expect(TIPO_LINEA_LABELS[value as TipoLinea]).toBeTruthy();
    }
  });

  it('TIPO_IVA_LABELS and TIPO_IVA_PORCENTAJE have an entry for every TipoIva value', () => {
    for (const value of numericValues(TipoIva)) {
      expect(TIPO_IVA_LABELS[value as TipoIva]).toBeTruthy();
      expect(TIPO_IVA_PORCENTAJE[value as TipoIva]).toBeDefined();
    }
  });

  it('ESTADO_PRESUPUESTO_LABELS has a non-empty entry for every EstadoPresupuesto value', () => {
    for (const value of numericValues(EstadoPresupuesto)) {
      expect(ESTADO_PRESUPUESTO_LABELS[value as EstadoPresupuesto]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `presupuesto.models.ts` does not exist yet (module not found).

- [ ] **Step 4: Re-run after Step 1's file exists**

The model file from Step 1 already makes these tests pass (there's no separate "minimal implementation" step here — the model file itself is minimal). Run (from `frontend/`): `npm test`.
Expected: PASS — all 3 label-map tests green.

- [ ] **Step 5: Write the failing tests for `PresupuestosService`**

```typescript
// frontend/src/app/features/presupuestos/presupuestos.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PresupuestosService } from './presupuestos.service';
import {
  CreatePresupuestoRequest,
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  TipoIva,
  TipoLinea,
  UpdatePresupuestoRequest,
} from '../../core/models/presupuesto.models';

const summary1: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
};

const presupuesto1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: '2026-09-01T00:00:00Z',
  notas: 'Nota de prueba',
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 10,
      precioUnitario: 50,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const createRequest: CreatePresupuestoRequest = {
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  fechaValidez: '2026-09-01',
  notas: 'Nota de prueba',
  lineas: [
    {
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 10,
      precioUnitario: 50,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
};

const updateRequest: UpdatePresupuestoRequest = {
  fechaValidez: '2026-09-01',
  notas: 'Nota de prueba',
  lineas: createRequest.lineas,
};

describe('PresupuestosService', () => {
  let service: PresupuestosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PresupuestosService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PresupuestosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads presupuestos on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.presupuestos()).toEqual([summary1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created presupuesto', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(presupuesto1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await createPromise;
    expect(result).toEqual(presupuesto1);
    expect(service.presupuestos()).toEqual([summary1]);
  });

  it('create() rejects and does not reload the list on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'POST');
    postReq.flush({ message: 'El cliente indicado no existe.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('update() puts the request, reloads the list, and resolves with the updated presupuesto', async () => {
    const updatePromise = service.update('p1', updateRequest);

    const putReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'PUT');
    expect(putReq.request.body).toEqual(updateRequest);
    putReq.flush(presupuesto1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await updatePromise;
    expect(result).toEqual(presupuesto1);
  });

  it('update() rejects with a 409 when the presupuesto is not editable and does not reload the list', async () => {
    const updatePromise = service.update('p1', updateRequest);
    const putReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'PUT');
    putReq.flush(
      { message: 'Solo se pueden editar presupuestos en estado Borrador.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(updatePromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('cambiarEstado() posts the estado, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const cambiarPromise = service.cambiarEstado('p1', EstadoPresupuesto.Enviado);

    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1/estado' && r.method === 'POST');
    expect(postReq.request.body).toEqual({ estado: EstadoPresupuesto.Enviado });
    postReq.flush(presupuesto1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    await cambiarPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('cambiarEstado() sets errorMessage and does not throw on failure', async () => {
    const cambiarPromise = service.cambiarEstado('p1', EstadoPresupuesto.Aceptado);
    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1/estado' && r.method === 'POST');
    postReq.flush(
      { message: 'El presupuesto ya fue convertido en factura.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(cambiarPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('El presupuesto ya fue convertido en factura.');
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('getById() gets the presupuesto by id without touching the list signals', async () => {
    const getPromise = service.getById('p1');
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'GET');
    req.flush(presupuesto1);

    const result = await getPromise;
    expect(result).toEqual(presupuesto1);
    expect(service.presupuestos()).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `presupuestos.service.ts` does not exist yet (module not found).

- [ ] **Step 7: Write the minimal `PresupuestosService` implementation**

```typescript
// frontend/src/app/features/presupuestos/presupuestos.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CreatePresupuestoRequest,
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  UpdatePresupuestoRequest,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class PresupuestosService {
  private readonly http = inject(HttpClient);

  readonly presupuestos = signal<PresupuestoSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const presupuestos = await firstValueFrom(this.http.get<PresupuestoSummary[]>('/api/presupuestos'));
      this.presupuestos.set(presupuestos);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreatePresupuestoRequest): Promise<Presupuesto> {
    const presupuesto = await firstValueFrom(this.http.post<Presupuesto>('/api/presupuestos', request));
    await this.load();
    return presupuesto;
  }

  async update(id: string, request: UpdatePresupuestoRequest): Promise<Presupuesto> {
    const presupuesto = await firstValueFrom(this.http.put<Presupuesto>(`/api/presupuestos/${id}`, request));
    await this.load();
    return presupuesto;
  }

  async cambiarEstado(id: string, estado: EstadoPresupuesto): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/presupuestos/${id}/estado`, { estado }));
      await this.load();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async getById(id: string): Promise<Presupuesto> {
    return firstValueFrom(this.http.get<Presupuesto>(`/api/presupuestos/${id}`));
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `presupuesto.models.spec.ts` (3 tests) and `presupuestos.service.spec.ts` (9 tests) tests green, no regressions in the other 92 existing tests.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add src/app/core/models/presupuesto.models.ts src/app/core/models/presupuesto.models.spec.ts src/app/features/presupuestos/presupuestos.service.ts src/app/features/presupuestos/presupuestos.service.spec.ts
git commit -m "feat(presupuestos): add Presupuesto models and PresupuestosService"
```

---

### Task 2: PresupuestoFormModal

**Files:**
- Create: `frontend/src/app/features/presupuestos/presupuesto-form-modal.ts`
- Create: `frontend/src/app/features/presupuestos/presupuesto-form-modal.html`
- Create: `frontend/src/app/features/presupuestos/presupuesto-form-modal.css`
- Test: `frontend/src/app/features/presupuestos/presupuesto-form-modal.spec.ts`

**Interfaces:**
- Consumes: `PresupuestosService.create()`/`.update()` (Task 1), `ClientesService.clientes` signal (existing, from `features/clientes/clientes.service.ts`), `extractErrorMessage()` from `core/http-error.util.ts`, models from `core/models/presupuesto.models.ts`.
- Produces (used by Task 3): `PresupuestoFormModal` component, selector `app-presupuesto-form-modal`, with public methods `openForCreate(): void`, `openForEdit(presupuesto: Presupuesto): void`, `cancel(): void`, `addLinea(): void`, `removeLinea(rowId: string): void`, `updateLinea(rowId: string, patch: Partial<LineaFormRow>): void`, `onSubmit(): Promise<void>`, output `readonly saved = output<void>()`, and `@ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>`.

- [ ] **Step 1: Write the failing tests for `PresupuestoFormModal`**

```typescript
// frontend/src/app/features/presupuestos/presupuesto-form-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { Cliente } from '../../core/models/cliente.models';
import { EstadoPresupuesto, Presupuesto, TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: 'España',
  email: null,
  telefono: null,
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const presupuesto1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: '2026-09-15T00:00:00Z',
  notas: 'Nota',
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPrecioFijo,
      descripcion: 'Diseño web',
      cantidad: 2,
      precioUnitario: 300,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('PresupuestoFormModal', () => {
  let component: PresupuestoFormModal;
  let presupuestosServiceStub: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    presupuestosServiceStub = {
      create: vi.fn().mockResolvedValue(presupuesto1),
      update: vi.fn().mockResolvedValue(presupuesto1),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: { clientes: signal<Cliente[]>([cliente1]) } },
      ],
    });

    component = TestBed.createComponent(PresupuestoFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form with one empty línea and shows the dialog', () => {
    component.clienteId.set('leftover');
    component.lineas.set([]);
    component.openForCreate();

    expect(component.editingId()).toBeNull();
    expect(component.clienteId()).toBe('');
    expect(component.numero()).toBe('');
    expect(component.lineas().length).toBe(1);
    expect(component.lineas()[0].descripcion).toBe('');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('openForEdit() preloads the form from the given presupuesto', () => {
    component.openForEdit(presupuesto1);

    expect(component.editingId()).toBe('p1');
    expect(component.clienteId()).toBe('c1');
    expect(component.numero()).toBe('PRE-2026-001');
    expect(component.fechaValidez()).toBe('2026-09-15');
    expect(component.notas()).toBe('Nota');
    expect(component.lineas().length).toBe(1);
    expect(component.lineas()[0].descripcion).toBe('Diseño web');
    expect(component.lineas()[0].cantidad).toBe(2);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
  });

  describe('línea management', () => {
    it('addLinea() appends an empty línea with a unique rowId', () => {
      component.openForCreate();
      const firstRowId = component.lineas()[0].rowId;
      component.addLinea();

      expect(component.lineas().length).toBe(2);
      expect(component.lineas()[1].rowId).not.toBe(firstRowId);
    });

    it('removeLinea() removes only the targeted row', () => {
      component.openForCreate();
      component.addLinea();
      const [row1, row2] = component.lineas();

      component.removeLinea(row1.rowId);

      expect(component.lineas().length).toBe(1);
      expect(component.lineas()[0].rowId).toBe(row2.rowId);
    });

    it('updateLinea() patches only the targeted row, leaving others untouched', () => {
      component.openForCreate();
      component.addLinea();
      const [row1, row2] = component.lineas();

      component.updateLinea(row1.rowId, { descripcion: 'Consultoría' });

      expect(component.lineas()[0].descripcion).toBe('Consultoría');
      expect(component.lineas()[1]).toEqual(row2);
    });
  });

  describe('resumen()', () => {
    it('computes subtotal, IVA and total for a single línea', () => {
      component.openForCreate();
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { cantidad: 10, precioUnitario: 50, tipoIva: TipoIva.General21 });

      const resumen = component.resumen();
      expect(resumen.subtotal).toBe(500);
      expect(resumen.totalIva).toBe(105);
      expect(resumen.total).toBe(605);
    });

    it('breaks down IVA by tipo when líneas mix different tipos', () => {
      component.openForCreate();
      const row1 = component.lineas()[0];
      component.updateLinea(row1.rowId, { cantidad: 1, precioUnitario: 100, tipoIva: TipoIva.General21 });
      component.addLinea();
      const row2 = component.lineas()[1];
      component.updateLinea(row2.rowId, { cantidad: 1, precioUnitario: 100, tipoIva: TipoIva.Exento });

      const resumen = component.resumen();
      expect(resumen.subtotal).toBe(200);
      expect(resumen.ivaPorTipo.get(TipoIva.General21)).toBe(21);
      expect(resumen.ivaPorTipo.get(TipoIva.Exento)).toBe(0);
      expect(resumen.total).toBe(221);
    });

    it('treats null cantidad/precioUnitario as 0 without producing NaN', () => {
      component.openForCreate();
      const resumen = component.resumen();

      expect(resumen.subtotal).toBe(0);
      expect(resumen.total).toBe(0);
      expect(Number.isNaN(resumen.total)).toBe(false);
    });
  });

  describe('onSubmit() validation', () => {
    it('blocks and sets formError when no cliente is selected (create mode)', async () => {
      component.openForCreate();
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar un cliente.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when número is blank (create mode)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('El número es obligatorio.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when there are no líneas', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('El presupuesto debe tener al menos una línea.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has a blank descripción', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: '   ', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la descripción es obligatoria.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea is left with cantidad empty (null)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', precioUnitario: 1 }); // cantidad stays null

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has cantidad zero or negative', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: -2, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has a negative precioUnitario', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: -5 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: el precio unitario no puede ser negativo.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });
  });

  describe('onSubmit() success paths', () => {
    it('calls create() with clienteId/numero and 1-based orden on each línea (create mode)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      component.fechaValidez.set('2026-09-15');
      component.notas.set('Nota');
      const row1 = component.lineas()[0];
      component.updateLinea(row1.rowId, {
        tipo: TipoLinea.Producto,
        descripcion: 'Licencia',
        cantidad: 3,
        precioUnitario: 20,
        tipoIva: TipoIva.Reducido10,
      });
      component.addLinea();
      const row2 = component.lineas()[1];
      component.updateLinea(row2.rowId, { descripcion: 'Soporte', cantidad: 1, precioUnitario: 100 });

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      await component.onSubmit();

      expect(presupuestosServiceStub.create).toHaveBeenCalledWith({
        clienteId: 'c1',
        numero: 'PRE-2026-002',
        fechaValidez: '2026-09-15',
        notas: 'Nota',
        lineas: [
          {
            tipo: TipoLinea.Producto,
            descripcion: 'Licencia',
            cantidad: 3,
            precioUnitario: 20,
            tipoIva: TipoIva.Reducido10,
            orden: 1,
          },
          {
            tipo: TipoLinea.ServicioPorHoras,
            descripcion: 'Soporte',
            cantidad: 1,
            precioUnitario: 100,
            tipoIva: TipoIva.General21,
            orden: 2,
          },
        ],
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
      expect(savedSpy).toHaveBeenCalled();
    });

    it('calls update(editingId) without clienteId/numero (edit mode)', async () => {
      component.openForEdit(presupuesto1);

      await component.onSubmit();

      expect(presupuestosServiceStub.update).toHaveBeenCalledWith('p1', {
        fechaValidez: '2026-09-15',
        notas: 'Nota',
        lineas: [
          {
            tipo: TipoLinea.ServicioPrecioFijo,
            descripcion: 'Diseño web',
            cantidad: 2,
            precioUnitario: 300,
            tipoIva: TipoIva.General21,
            orden: 1,
          },
        ],
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    });

    it('sends null fechaValidez/notas when left blank', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(presupuestosServiceStub.create).toHaveBeenCalledWith(
        expect.objectContaining({ fechaValidez: null, notas: null }),
      );
    });

    it('sets formError and keeps the dialog open on backend failure', async () => {
      presupuestosServiceStub.create.mockRejectedValue({
        error: { message: 'El cliente indicado no existe.' },
      });
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('El cliente indicado no existe.');
      expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `presupuesto-form-modal.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the minimal `PresupuestoFormModal` implementation**

```typescript
// frontend/src/app/features/presupuestos/presupuesto-form-modal.ts
import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import {
  CreatePresupuestoRequest,
  LineaPresupuestoRequest,
  Presupuesto,
  TIPO_IVA_PORCENTAJE,
  TipoIva,
  TipoLinea,
  UpdatePresupuestoRequest,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

export interface LineaFormRow {
  rowId: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
  tipoIva: TipoIva;
}

function filaVacia(): LineaFormRow {
  return {
    rowId: crypto.randomUUID(),
    tipo: TipoLinea.ServicioPorHoras,
    descripcion: '',
    cantidad: null,
    precioUnitario: null,
    tipoIva: TipoIva.General21,
  };
}

@Component({
  selector: 'app-presupuesto-form-modal',
  imports: [FormsModule],
  templateUrl: './presupuesto-form-modal.html',
  styleUrl: './presupuesto-form-modal.css',
})
export class PresupuestoFormModal {
  private readonly presupuestosService = inject(PresupuestosService);
  protected readonly clientesService = inject(ClientesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  readonly clienteId = signal('');
  readonly numero = signal('');
  readonly fechaValidez = signal('');
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

  openForCreate(): void {
    this.editingId.set(null);
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  openForEdit(presupuesto: Presupuesto): void {
    this.editingId.set(presupuesto.id);
    this.clienteId.set(presupuesto.clienteId);
    this.numero.set(presupuesto.numero);
    this.fechaValidez.set(presupuesto.fechaValidez ? presupuesto.fechaValidez.slice(0, 10) : '');
    this.notas.set(presupuesto.notas ?? '');
    this.lineas.set(
      presupuesto.lineas.map((l) => ({
        rowId: crypto.randomUUID(),
        tipo: l.tipo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        tipoIva: l.tipoIva,
      })),
    );
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  addLinea(): void {
    this.lineas.update((rows) => [...rows, filaVacia()]);
  }

  removeLinea(rowId: string): void {
    this.lineas.update((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  updateLinea(rowId: string, patch: Partial<LineaFormRow>): void {
    this.lineas.update((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async onSubmit(): Promise<void> {
    const editingId = this.editingId();

    if (!editingId) {
      if (!this.clienteId()) {
        this.formError.set('Debés seleccionar un cliente.');
        return;
      }
      if (!this.numero().trim()) {
        this.formError.set('El número es obligatorio.');
        return;
      }
    }

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('El presupuesto debe tener al menos una línea.');
      return;
    }

    const lineasRequest: LineaPresupuestoRequest[] = [];
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const n = i + 1;
      const descripcion = fila.descripcion.trim();
      if (!descripcion) {
        this.formError.set(`Línea ${n}: la descripción es obligatoria.`);
        return;
      }
      const cantidad = Number(fila.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        this.formError.set(`Línea ${n}: la cantidad debe ser mayor que 0.`);
        return;
      }
      const precioUnitario = Number(fila.precioUnitario);
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        this.formError.set(`Línea ${n}: el precio unitario no puede ser negativo.`);
        return;
      }
      lineasRequest.push({
        tipo: fila.tipo,
        descripcion,
        cantidad,
        precioUnitario,
        tipoIva: fila.tipoIva,
        orden: n,
      });
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      if (editingId) {
        const request: UpdatePresupuestoRequest = {
          fechaValidez: this.fechaValidez() || null,
          notas: this.notas().trim() || null,
          lineas: lineasRequest,
        };
        await this.presupuestosService.update(editingId, request);
      } else {
        const request: CreatePresupuestoRequest = {
          clienteId: this.clienteId(),
          numero: this.numero().trim(),
          fechaValidez: this.fechaValidez() || null,
          notas: this.notas().trim() || null,
          lineas: lineasRequest,
        };
        await this.presupuestosService.create(request);
      }
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private resetForm(): void {
    this.clienteId.set('');
    this.numero.set('');
    this.fechaValidez.set('');
    this.notas.set('');
    this.lineas.set([filaVacia()]);
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/features/presupuestos/presupuesto-form-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-[640px] max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">{{ editingId() ? 'Editar presupuesto' : 'Nuevo presupuesto' }}</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Cliente *
      <select
        [ngModel]="clienteId()"
        (ngModelChange)="clienteId.set($event)"
        name="clienteId"
        [disabled]="editingId() !== null"
        class="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      >
        <option [ngValue]="''" disabled>Seleccioná un cliente…</option>
        @for (cliente of clientesService.clientes(); track cliente.id) {
          <option [ngValue]="cliente.id">{{ cliente.nombre }}</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Número *
      <input
        [ngModel]="numero()"
        (ngModelChange)="numero.set($event)"
        name="numero"
        type="text"
        [disabled]="editingId() !== null"
        class="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Fecha de validez
      <input
        [ngModel]="fechaValidez()"
        (ngModelChange)="fechaValidez.set($event)"
        name="fechaValidez"
        type="date"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Notas
      <textarea
        [ngModel]="notas()"
        (ngModelChange)="notas.set($event)"
        name="notas"
        rows="2"
        class="rounded border border-slate-300 px-3 py-2"
      ></textarea>
    </label>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Líneas</span>
        <button type="button" (click)="addLinea()" class="text-sm text-slate-600 hover:underline">
          Añadir línea
        </button>
      </div>

      <table class="w-full border-collapse text-left text-xs">
        <thead>
          <tr class="border-b border-slate-200 text-slate-500">
            <th class="py-1">Tipo</th>
            <th class="py-1">Descripción</th>
            <th class="py-1">Cantidad</th>
            <th class="py-1">Precio</th>
            <th class="py-1">IVA</th>
            <th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          @for (fila of lineas(); track fila.rowId) {
            <tr class="border-b border-slate-100">
              <td class="py-1 pr-1">
                <select
                  [ngModel]="fila.tipo"
                  (ngModelChange)="updateLinea(fila.rowId, { tipo: $event })"
                  [name]="'tipo-' + fila.rowId"
                  class="w-full rounded border border-slate-300 px-1 py-1"
                >
                  <option [ngValue]="TipoLinea.ServicioPorHoras">Servicio por horas</option>
                  <option [ngValue]="TipoLinea.ServicioPrecioFijo">Servicio a precio fijo</option>
                  <option [ngValue]="TipoLinea.Suscripcion">Suscripción</option>
                  <option [ngValue]="TipoLinea.Producto">Producto</option>
                </select>
              </td>
              <td class="py-1 pr-1">
                <input
                  [ngModel]="fila.descripcion"
                  (ngModelChange)="updateLinea(fila.rowId, { descripcion: $event })"
                  [name]="'descripcion-' + fila.rowId"
                  type="text"
                  class="w-full rounded border border-slate-300 px-1 py-1"
                />
              </td>
              <td class="py-1 pr-1">
                <input
                  [ngModel]="fila.cantidad"
                  (ngModelChange)="updateLinea(fila.rowId, { cantidad: $event })"
                  [name]="'cantidad-' + fila.rowId"
                  type="number"
                  class="w-20 rounded border border-slate-300 px-1 py-1"
                />
              </td>
              <td class="py-1 pr-1">
                <input
                  [ngModel]="fila.precioUnitario"
                  (ngModelChange)="updateLinea(fila.rowId, { precioUnitario: $event })"
                  [name]="'precioUnitario-' + fila.rowId"
                  type="number"
                  class="w-20 rounded border border-slate-300 px-1 py-1"
                />
              </td>
              <td class="py-1 pr-1">
                <select
                  [ngModel]="fila.tipoIva"
                  (ngModelChange)="updateLinea(fila.rowId, { tipoIva: $event })"
                  [name]="'tipoIva-' + fila.rowId"
                  class="w-full rounded border border-slate-300 px-1 py-1"
                >
                  <option [ngValue]="TipoIva.General21">21%</option>
                  <option [ngValue]="TipoIva.Reducido10">10%</option>
                  <option [ngValue]="TipoIva.Superreducido4">4%</option>
                  <option [ngValue]="TipoIva.Exento">Exento</option>
                </select>
              </td>
              <td class="py-1 text-right">
                <button type="button" (click)="removeLinea(fila.rowId)" class="text-red-600 hover:underline">
                  Quitar
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      <div class="flex flex-col items-end gap-0.5 text-sm text-slate-600">
        <span>Subtotal: {{ resumen().subtotal.toFixed(2) }} €</span>
        <span>IVA: {{ resumen().totalIva.toFixed(2) }} €</span>
        <span class="font-semibold text-slate-900">Total: {{ resumen().total.toFixed(2) }} €</span>
      </div>
    </div>

    <div class="mt-2 flex justify-end gap-2">
      <button type="button" (click)="cancel()" class="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
        Cancelar
      </button>
      <button
        type="submit"
        [disabled]="isSaving()"
        class="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {{ isSaving() ? 'Guardando…' : 'Guardar' }}
      </button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 5: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/presupuestos/presupuesto-form-modal.css */
/* Presupuesto form modal styles */
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all 20 `PresupuestoFormModal` tests green, no regressions.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/features/presupuestos/presupuesto-form-modal.ts src/app/features/presupuestos/presupuesto-form-modal.html src/app/features/presupuestos/presupuesto-form-modal.css src/app/features/presupuestos/presupuesto-form-modal.spec.ts
git commit -m "feat(presupuestos): add PresupuestoFormModal component"
```

---

### Task 3: Presupuestos list component

**Files:**
- Create: `frontend/src/app/features/presupuestos/presupuestos.ts`
- Create: `frontend/src/app/features/presupuestos/presupuestos.html`
- Create: `frontend/src/app/features/presupuestos/presupuestos.css`
- Test: `frontend/src/app/features/presupuestos/presupuestos.spec.ts`

**Interfaces:**
- Consumes: `PresupuestosService` (Task 1) — `presupuestos`, `isLoading`, `errorMessage` signals, `load()`, `getById()`, `cambiarEstado()`; `ClientesService` (existing) — `clientes` signal, `load()`; `PresupuestoFormModal` (Task 2) — `openForCreate()`, `openForEdit()`, output `saved`.
- Produces (used by Task 4): `Presupuestos` component, selector `app-presupuestos`, with `ngOnInit(): void`, `onNew(): void`, `onEdit(p: PresupuestoSummary): Promise<void>`, `onEnviar/onAceptar/onRechazar(p: PresupuestoSummary): Promise<void>`.

- [ ] **Step 1: Write the failing tests for `Presupuestos`**

```typescript
// frontend/src/app/features/presupuestos/presupuestos.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Presupuestos } from './presupuestos';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { Cliente } from '../../core/models/cliente.models';
import {
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  TipoIva,
  TipoLinea,
} from '../../core/models/presupuesto.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: 'España',
  email: null,
  telefono: null,
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const summaryBorrador: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
};

const summaryEnviado: PresupuestoSummary = {
  id: 'p2',
  clienteId: 'c1',
  numero: 'PRE-2026-002',
  estado: EstadoPresupuesto.Enviado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 2,
};

const summaryAceptado: PresupuestoSummary = {
  id: 'p3',
  clienteId: 'desconocido',
  numero: 'PRE-2026-003',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
};

const detalle1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: null,
  notas: null,
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

function makeStubs() {
  const presupuestosServiceStub = {
    presupuestos: signal<PresupuestoSummary[]>([summaryBorrador, summaryEnviado, summaryAceptado]),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    load: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(detalle1),
    cambiarEstado: vi.fn().mockResolvedValue(undefined),
  };
  const clientesServiceStub = {
    clientes: signal<Cliente[]>([cliente1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { presupuestosServiceStub, clientesServiceStub };
}

describe('Presupuestos', () => {
  let component: Presupuestos;
  let presupuestosServiceStub: ReturnType<typeof makeStubs>['presupuestosServiceStub'];
  let clientesServiceStub: ReturnType<typeof makeStubs>['clientesServiceStub'];
  let modalStub: { openForCreate: ReturnType<typeof vi.fn>; openForEdit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const stubs = makeStubs();
    presupuestosServiceStub = stubs.presupuestosServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    modalStub = { openForCreate: vi.fn(), openForEdit: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
      ],
    });

    component = TestBed.createComponent(Presupuestos).componentInstance;
    component.modal = modalStub as unknown as PresupuestoFormModal;
  });

  it('ngOnInit() loads presupuestos and clientes', () => {
    component.ngOnInit();
    expect(presupuestosServiceStub.load).toHaveBeenCalled();
    expect(clientesServiceStub.load).toHaveBeenCalled();
  });

  it('nombreCliente() resolves the cliente name or a fallback', () => {
    expect(component.nombreCliente('c1')).toBe('Acme SL');
    expect(component.nombreCliente('desconocido')).toBe('—');
  });

  it('onNew() opens the modal for create', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  it('onEdit() fetches the detail and opens the modal for edit', async () => {
    await component.onEdit(summaryBorrador);
    expect(presupuestosServiceStub.getById).toHaveBeenCalledWith('p1');
    expect(modalStub.openForEdit).toHaveBeenCalledWith(detalle1);
  });

  it('onEdit() sets errorMessage and does not open the modal when getById fails', async () => {
    presupuestosServiceStub.getById.mockRejectedValue({ error: { message: 'No encontrado.' } });

    await component.onEdit(summaryBorrador);

    expect(presupuestosServiceStub.errorMessage()).toBe('No encontrado.');
    expect(modalStub.openForEdit).not.toHaveBeenCalled();
  });

  it('onEnviar() cambia el estado a Enviado', async () => {
    await component.onEnviar(summaryBorrador);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p1', EstadoPresupuesto.Enviado);
  });

  it('onAceptar() cambia el estado a Aceptado', async () => {
    await component.onAceptar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p2', EstadoPresupuesto.Aceptado);
  });

  it('onRechazar() cambia el estado a Rechazado tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await component.onRechazar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p2', EstadoPresupuesto.Rechazado);
  });

  it('onRechazar() no hace nada si se cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.onRechazar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).not.toHaveBeenCalled();
  });

  describe('template rendering', () => {
    function render() {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      TestBed.configureTestingModule({
        providers: [
          { provide: PresupuestosService, useValue: stubs.presupuestosServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(Presupuestos);
      fixture.detectChanges();
      return fixture;
    }

    it('renders one row per presupuesto with the resolved cliente name', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('PRE-2026-001');
      expect(text).toContain('Acme SL');
    });

    it('shows Editar/Enviar only for Borrador rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const borradorRow = rows[0] as HTMLElement;
      expect(borradorRow.textContent).toContain('Editar');
      expect(borradorRow.textContent).toContain('Enviar');
      expect(borradorRow.textContent).not.toContain('Aceptar');
    });

    it('shows Aceptar/Rechazar only for Enviado rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const enviadoRow = rows[1] as HTMLElement;
      expect(enviadoRow.textContent).toContain('Aceptar');
      expect(enviadoRow.textContent).toContain('Rechazar');
      expect(enviadoRow.textContent).not.toContain('Editar');
    });

    it('shows no action buttons for Aceptado rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const aceptadoRow = rows[2] as HTMLElement;
      expect(aceptadoRow.textContent).not.toContain('Editar');
      expect(aceptadoRow.textContent).not.toContain('Enviar');
      expect(aceptadoRow.textContent).not.toContain('Aceptar');
      expect(aceptadoRow.textContent).not.toContain('Rechazar');
    });

    it('shows the empty-state message when there are no presupuestos', () => {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      stubs.presupuestosServiceStub.presupuestos.set([]);
      TestBed.configureTestingModule({
        providers: [
          { provide: PresupuestosService, useValue: stubs.presupuestosServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(Presupuestos);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay presupuestos — creá el primero con "Nuevo presupuesto".');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `presupuestos.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the minimal `Presupuestos` implementation**

```typescript
// frontend/src/app/features/presupuestos/presupuestos.ts
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import {
  EstadoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  PresupuestoSummary,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-presupuestos',
  imports: [PresupuestoFormModal],
  templateUrl: './presupuestos.html',
  styleUrl: './presupuestos.css',
})
export class Presupuestos implements OnInit {
  protected readonly presupuestosService = inject(PresupuestosService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly EstadoPresupuesto = EstadoPresupuesto;
  protected readonly ESTADO_PRESUPUESTO_LABELS = ESTADO_PRESUPUESTO_LABELS;

  @ViewChild(PresupuestoFormModal) modal!: PresupuestoFormModal;

  ngOnInit(): void {
    void this.presupuestosService.load();
    void this.clientesService.load();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  async onEdit(p: PresupuestoSummary): Promise<void> {
    try {
      const detalle = await this.presupuestosService.getById(p.id);
      this.modal.openForEdit(detalle);
    } catch (error) {
      this.presupuestosService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async onEnviar(p: PresupuestoSummary): Promise<void> {
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Enviado);
  }

  async onAceptar(p: PresupuestoSummary): Promise<void> {
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Aceptado);
  }

  async onRechazar(p: PresupuestoSummary): Promise<void> {
    if (!confirm(`¿Rechazar el presupuesto ${p.numero}?`)) {
      return;
    }
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Rechazado);
  }

  onSaved(): void {
    // No-op: PresupuestosService.create()/update() already reload the list
    // themselves, and the modal closes itself on success. Bound to (saved)
    // only so the modal's documented output has a consumer.
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/features/presupuestos/presupuestos.html -->
<div class="mx-auto max-w-5xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Presupuestos</h1>
    <button type="button" (click)="onNew()" class="rounded bg-slate-900 px-4 py-2 text-sm text-white">
      Nuevo presupuesto
    </button>
  </div>

  @if (presupuestosService.errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ presupuestosService.errorMessage() }}</p>
  }

  @if (presupuestosService.isLoading()) {
    <p class="text-sm text-slate-500">Cargando…</p>
  } @else if (presupuestosService.presupuestos().length > 0) {
    <table class="w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Número</th>
          <th class="py-2">Cliente</th>
          <th class="py-2">Estado</th>
          <th class="py-2">Fecha emisión</th>
          <th class="py-2">Nº líneas</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (p of presupuestosService.presupuestos(); track p.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2">{{ p.numero }}</td>
            <td class="py-2">{{ nombreCliente(p.clienteId) }}</td>
            <td class="py-2">{{ ESTADO_PRESUPUESTO_LABELS[p.estado] }}</td>
            <td class="py-2">{{ formatFecha(p.fechaEmision) }}</td>
            <td class="py-2">{{ p.numeroLineas }}</td>
            <td class="py-2 text-right">
              @if (p.estado === EstadoPresupuesto.Borrador) {
                <button type="button" (click)="onEdit(p)" class="mr-3 text-slate-600 hover:underline">
                  Editar
                </button>
                <button type="button" (click)="onEnviar(p)" class="text-slate-600 hover:underline">
                  Enviar
                </button>
              } @else if (p.estado === EstadoPresupuesto.Enviado) {
                <button type="button" (click)="onAceptar(p)" class="mr-3 text-slate-600 hover:underline">
                  Aceptar
                </button>
                <button type="button" (click)="onRechazar(p)" class="text-red-600 hover:underline">
                  Rechazar
                </button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  } @else {
    <p class="text-sm text-slate-500">Todavía no hay presupuestos — creá el primero con "Nuevo presupuesto".</p>
  }

  <app-presupuesto-form-modal (saved)="onSaved()" />
</div>
```

- [ ] **Step 5: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/presupuestos/presupuestos.css */
/* Presupuestos list styles */
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all 14 `Presupuestos` tests green, no regressions.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/features/presupuestos/presupuestos.ts src/app/features/presupuestos/presupuestos.html src/app/features/presupuestos/presupuestos.css src/app/features/presupuestos/presupuestos.spec.ts
git commit -m "feat(presupuestos): add Presupuestos list component"
```

---

### Task 4: Route + nav wiring

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/layout/layout.html`

**Interfaces:**
- Consumes: `Presupuestos` component (Task 3).
- Produces: nothing consumed by later tasks (this plan's last task).

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import:

```typescript
import { Presupuestos } from './features/presupuestos/presupuestos';
```

And the child route, after `series`:

```typescript
      { path: 'clientes', component: Clientes },
      { path: 'series', component: Series },
      { path: 'presupuestos', component: Presupuestos },
```

- [ ] **Step 2: Add the nav link**

In `frontend/src/app/shared/layout/layout.html`, add after the Series link:

```html
      <a routerLink="/presupuestos" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Presupuestos
      </a>
```

- [ ] **Step 3: Run the full test suite**

Run (from `frontend/`): `npm test`
Expected: PASS — 23 files / 138 tests (19+4 new spec files: `presupuesto.models.spec.ts` 3 tests, `presupuestos.service.spec.ts` 9 tests, `presupuesto-form-modal.spec.ts` 20 tests, `presupuestos.spec.ts` 14 tests = 92+46), no regressions.

- [ ] **Step 4: Manually verify in the browser**

With backend (`dotnet run --urls http://localhost:5091` from `backend/LocaleBoost.Api`) and frontend (`npm start` from `frontend/`) running, log in (create at least one Cliente first if the account has none), navigate to `/presupuestos`, confirm:

- Empty state shows correctly on a fresh account.
- "Nuevo presupuesto" opens the modal with the cliente dropdown populated and one empty línea row.
- Submitting with no cliente selected, or a blank número, shows the corresponding validation message and does not call the backend.
- Adding a second línea, removing a línea, and editing línea fields update the live subtotal/IVA/total summary correctly (test at least one case mixing two different `TipoIva` values).
- Submitting with a línea that has an empty/negative cantidad, or a negative precio, shows the corresponding "Línea N: …" message and does not call the backend.
- Submitting a valid presupuesto (cliente + número + at least one valid línea) closes the modal and the new row appears in the table with the correct estado (Borrador) and cliente name.
- The Borrador row shows "Editar" and "Enviar"; clicking "Editar" reopens the modal with cliente/número disabled and the líneas prefilled, and re-submitting a change (e.g. edited línea) updates the row.
- Clicking "Enviar" changes the row's estado to Enviado and its action buttons switch to "Aceptar"/"Rechazar"; the "Editar" button is gone.
- Clicking "Rechazar" prompts a confirmation; cancelling leaves the estado unchanged, confirming changes it to Rechazado with no further action buttons.
- On a second presupuesto, clicking "Aceptar" changes its estado to Aceptado with no further action buttons (no "convertir a factura" button — out of scope).
- Reloading the page preserves all state (confirms persistence, not just in-memory signal state).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/app.routes.ts src/app/shared/layout/layout.html
git commit -m "feat(presupuestos): wire up /presupuestos route and nav link"
```
