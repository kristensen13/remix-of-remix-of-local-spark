# Pantalla de Clientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Clientes screen (list, search, create, edit, delete) in the Angular frontend, consuming the existing `/api/clientes` CRUD backend.

**Architecture:** A `ClientesService` holds signal-based state (`clientes`, `isLoading`, `errorMessage`) and talks to `/api/clientes` via `HttpClient`. A `Clientes` list component renders a filterable table and delegates create/edit to a `ClienteFormModal` component built on the native `<dialog>` element, controlled imperatively via `@ViewChild`. The screen is added as a new protected route with a nav link.

**Tech Stack:** Angular 22 standalone components, signals, `FormsModule`/`ngModel`, Tailwind utility classes, Vitest (`@angular/build:unit-test`), native `HTMLDialogElement`.

**Spec:** `docs/superpowers/specs/2026-08-01-pantalla-clientes-design.md`

## Global Constraints

- Follow existing project conventions exactly: standalone components, one folder per feature under `src/app/features/`, `.ts` + `.html` + `.css` + `.spec.ts` split into separate files (never inline templates/styles).
- State lives in signals inside an injectable service (`@Service()` decorator — this project's alias for `@Injectable()`, see `auth.service.ts`), exposed as `readonly` to components.
- HTTP calls use `HttpClient` + `firstValueFrom` (no `.subscribe()`).
- Errors are formatted with the existing `extractErrorMessage()` from `core/http-error.util.ts` — do not modify that file.
- Forms use `FormsModule` + `[ngModel]`/`(ngModelChange)` two-way binding (banana-in-a-box), never Reactive Forms.
- Tailwind utility classes inline in templates; no new CSS framework or component library.
- No new npm dependencies — the modal is a hand-rolled `<dialog>`-based component.
- New routes nest under the existing `Layout` component, guarded by `authGuard`, inside `app.routes.ts`.
- **jsdom in this project does not implement `HTMLDialogElement.showModal()`/`close()`** (verified: calling `.showModal()` throws `TypeError: showModal is not a function` under the project's jsdom 28.1.0). Any component that calls these methods must expose the `ElementRef` as a normal (non-`private`) `@ViewChild` so tests can replace it with a `{ nativeElement: { showModal: vi.fn(), close: vi.fn() } }` stub — do not attempt to render the real dialog in tests.
- Existing component tests in this codebase never call `fixture.detectChanges()` — they construct the component with `TestBed.createComponent(X).componentInstance` and assign `@ViewChild` references / stub services by hand. Follow this exact pattern for consistency and to avoid the jsdom dialog limitation.
- Out of scope: Series, Presupuestos, and Facturas screens (separate specs/plans), PDF generation, the anulación endpoint.
- Run tests from `frontend/` with `npm test` (runs once, not in watch mode — confirmed: 13 files / 50 tests pass on the current baseline before this plan's changes).

---

### Task 1: Cliente models + ClientesService

**Files:**
- Create: `frontend/src/app/core/models/cliente.models.ts`
- Create: `frontend/src/app/features/clientes/clientes.service.ts`
- Test: `frontend/src/app/features/clientes/clientes.service.spec.ts`

**Interfaces:**
- Consumes: nothing new (only `HttpClient`, `extractErrorMessage` from `core/http-error.util.ts`).
- Produces (used by Tasks 2 and 3):
  - `Cliente` — `{ id: string; nombre: string; nif: string; direccion: string; codigoPostal: string | null; ciudad: string | null; provincia: string | null; pais: string; email: string | null; telefono: string | null; esAutonomoOProfesional: boolean; createdAt: string }`
  - `ClienteFormValue` — same shape as `Cliente` minus `id`/`createdAt`, with `pais: string | null`.
  - `CreateClienteRequest` / `UpdateClienteRequest` — both `= ClienteFormValue`.
  - `ClientesService` with:
    - `clientes: Signal<Cliente[]>` (readonly)
    - `isLoading: Signal<boolean>` (readonly)
    - `errorMessage: Signal<string | null>` (readonly)
    - `load(): Promise<void>`
    - `create(request: CreateClienteRequest): Promise<Cliente>`
    - `update(id: string, request: UpdateClienteRequest): Promise<Cliente>`
    - `remove(id: string): Promise<void>`

- [ ] **Step 1: Create the models file**

`frontend/src/app/core/models/cliente.models.ts`:

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

export interface ClienteFormValue {
  nombre: string;
  nif: string;
  direccion: string;
  codigoPostal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  email: string | null;
  telefono: string | null;
  esAutonomoOProfesional: boolean;
}

export type CreateClienteRequest = ClienteFormValue;
export type UpdateClienteRequest = ClienteFormValue;
```

- [ ] **Step 2: Write the failing tests for `ClientesService`**

`frontend/src/app/features/clientes/clientes.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientesService } from './clientes.service';
import { Cliente, CreateClienteRequest } from '../../core/models/cliente.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: '28001',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  pais: 'España',
  email: 'acme@example.com',
  telefono: '600111222',
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const createRequest: CreateClienteRequest = {
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: null,
  email: null,
  telefono: null,
  esAutonomoOProfesional: false,
};

describe('ClientesService', () => {
  let service: ClientesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads clientes on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    req.flush([cliente1]);
    await loadPromise;

    expect(service.clientes()).toEqual([cliente1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created cliente', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(cliente1);

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([cliente1]);

    const result = await createPromise;
    expect(result).toEqual(cliente1);
    expect(service.clientes()).toEqual([cliente1]);
  });

  it('create() rejects and does not reload the list on failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'POST');
    postReq.flush({ message: 'Nombre y NIF son obligatorios.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/clientes' && r.method === 'GET')).toHaveLength(0);
  });

  it('update() puts the request to /api/clientes/{id} and reloads the list', async () => {
    const updatePromise = service.update('c1', createRequest);

    const putReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'PUT');
    expect(putReq.request.body).toEqual(createRequest);
    putReq.flush(cliente1);

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([cliente1]);

    const result = await updatePromise;
    expect(result).toEqual(cliente1);
  });

  it('remove() deletes and reloads the list', async () => {
    const removePromise = service.remove('c1');

    const deleteReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'DELETE');
    deleteReq.flush(null);

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([]);

    await removePromise;
    expect(service.clientes()).toEqual([]);
    expect(service.errorMessage()).toBeNull();
  });

  it('remove() sets errorMessage on 409 conflict without reloading or clearing clientes', async () => {
    const loadPromise = service.load();
    httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET').flush([cliente1]);
    await loadPromise;

    const removePromise = service.remove('c1');
    const deleteReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'DELETE');
    deleteReq.flush(
      { message: 'No se puede eliminar un cliente con facturas o presupuestos asociados.' },
      { status: 409, statusText: 'Conflict' },
    );
    await removePromise;

    expect(service.errorMessage()).toBe('No se puede eliminar un cliente con facturas o presupuestos asociados.');
    expect(service.clientes()).toEqual([cliente1]);
    expect(httpMock.match((r) => r.url === '/api/clientes' && r.method === 'GET')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `Cannot find module './clientes.service'` (the service doesn't exist yet).

- [ ] **Step 4: Implement `ClientesService`**

`frontend/src/app/features/clientes/clientes.service.ts`:

```ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cliente, CreateClienteRequest, UpdateClienteRequest } from '../../core/models/cliente.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class ClientesService {
  private readonly http = inject(HttpClient);

  readonly clientes = signal<Cliente[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const clientes = await firstValueFrom(this.http.get<Cliente[]>('/api/clientes'));
      this.clientes.set(clientes);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreateClienteRequest): Promise<Cliente> {
    const cliente = await firstValueFrom(this.http.post<Cliente>('/api/clientes', request));
    await this.load();
    return cliente;
  }

  async update(id: string, request: UpdateClienteRequest): Promise<Cliente> {
    const cliente = await firstValueFrom(this.http.put<Cliente>(`/api/clientes/${id}`, request));
    await this.load();
    return cliente;
  }

  async remove(id: string): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.delete<void>(`/api/clientes/${id}`));
      await this.load();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }
}
```

Note: `create()`/`update()` deliberately do **not** catch errors — they propagate the raw `HttpErrorResponse` to the caller (the modal in Task 2), which formats it locally. This keeps `errorMessage` on this service reserved for `load()`/`remove()` failures shown on the main screen, matching the spec's "dos slots de error distintos".

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS (all `ClientesService` tests green; full suite still at prior count + these new ones).

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/app/core/models/cliente.models.ts src/app/features/clientes/clientes.service.ts src/app/features/clientes/clientes.service.spec.ts
git commit -m "feat(clientes): add Cliente models and ClientesService"
```

---

### Task 2: ClienteFormModal component

**Files:**
- Create: `frontend/src/app/features/clientes/cliente-form-modal.ts`
- Create: `frontend/src/app/features/clientes/cliente-form-modal.html`
- Create: `frontend/src/app/features/clientes/cliente-form-modal.css`
- Test: `frontend/src/app/features/clientes/cliente-form-modal.spec.ts`

**Interfaces:**
- Consumes: `ClientesService.create(request)` / `.update(id, request)` from Task 1; `Cliente`, `CreateClienteRequest` from `cliente.models.ts`; `extractErrorMessage` from `core/http-error.util.ts`.
- Produces (used by Task 3):
  - Component `ClienteFormModal`, selector `app-cliente-form-modal`.
  - Public method `openForCreate(): void`.
  - Public method `openForEdit(cliente: Cliente): void`.
  - Public (non-private) field `dialogEl!: ElementRef<HTMLDialogElement>` (must stay non-private so tests can stub it).
  - `@Output() saved = new EventEmitter<void>()`.

- [ ] **Step 1: Write the failing tests for `ClienteFormModal`**

`frontend/src/app/features/clientes/cliente-form-modal.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { ClienteFormModal } from './cliente-form-modal';
import { ClientesService } from './clientes.service';
import { Cliente } from '../../core/models/cliente.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: '28001',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  pais: 'España',
  email: 'acme@example.com',
  telefono: '600111222',
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('ClienteFormModal', () => {
  let component: ClienteFormModal;
  let clientesServiceStub: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clientesServiceStub = {
      create: vi.fn().mockResolvedValue(cliente1),
      update: vi.fn().mockResolvedValue(cliente1),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ClientesService, useValue: clientesServiceStub }],
    });

    component = TestBed.createComponent(ClienteFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form to defaults and shows the dialog', () => {
    component.nombre.set('leftover');
    component.openForCreate();

    expect(component.editingId()).toBeNull();
    expect(component.nombre()).toBe('');
    expect(component.pais()).toBe('España');
    expect(component.esAutonomoOProfesional()).toBe(false);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('openForEdit() preloads the form from the given cliente', () => {
    component.openForEdit(cliente1);

    expect(component.editingId()).toBe('c1');
    expect(component.nombre()).toBe('Acme SL');
    expect(component.nif()).toBe('B12345678');
    expect(component.email()).toBe('acme@example.com');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(clientesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when nombre, nif or direccion are blank', async () => {
    component.openForCreate();
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(component.formError()).toBe('Nombre, NIF y Dirección son obligatorios.');
    expect(clientesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() calls create() in create mode, closes the dialog, and emits saved', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);
    component.openForCreate();
    component.nombre.set('Acme SL');
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(clientesServiceStub.create).toHaveBeenCalledWith({
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
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('onSubmit() calls update() with the editing id in edit mode', async () => {
    component.openForEdit(cliente1);

    await component.onSubmit();

    expect(clientesServiceStub.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ nombre: 'Acme SL', nif: 'B12345678' }),
    );
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    clientesServiceStub.create.mockRejectedValue({ error: { message: 'Nombre y NIF son obligatorios.' } });
    component.openForCreate();
    component.nombre.set('Acme SL');
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(component.formError()).toBe('Nombre y NIF son obligatorios.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `Cannot find module './cliente-form-modal'`.

- [ ] **Step 3: Implement `ClienteFormModal`**

`frontend/src/app/features/clientes/cliente-form-modal.ts`:

```ts
import { Component, ElementRef, EventEmitter, Output, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ClientesService } from './clientes.service';
import { Cliente, CreateClienteRequest } from '../../core/models/cliente.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-cliente-form-modal',
  imports: [FormsModule],
  templateUrl: './cliente-form-modal.html',
  styleUrl: './cliente-form-modal.css',
})
export class ClienteFormModal {
  private readonly clientesService = inject(ClientesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  @Output() saved = new EventEmitter<void>();

  readonly editingId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly nombre = signal('');
  readonly nif = signal('');
  readonly direccion = signal('');
  readonly codigoPostal = signal('');
  readonly ciudad = signal('');
  readonly provincia = signal('');
  readonly pais = signal('España');
  readonly email = signal('');
  readonly telefono = signal('');
  readonly esAutonomoOProfesional = signal(false);

  openForCreate(): void {
    this.editingId.set(null);
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  openForEdit(cliente: Cliente): void {
    this.editingId.set(cliente.id);
    this.nombre.set(cliente.nombre);
    this.nif.set(cliente.nif);
    this.direccion.set(cliente.direccion);
    this.codigoPostal.set(cliente.codigoPostal ?? '');
    this.ciudad.set(cliente.ciudad ?? '');
    this.provincia.set(cliente.provincia ?? '');
    this.pais.set(cliente.pais);
    this.email.set(cliente.email ?? '');
    this.telefono.set(cliente.telefono ?? '');
    this.esAutonomoOProfesional.set(cliente.esAutonomoOProfesional);
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const nombre = this.nombre().trim();
    const nif = this.nif().trim();
    const direccion = this.direccion().trim();

    if (!nombre || !nif || !direccion) {
      this.formError.set('Nombre, NIF y Dirección son obligatorios.');
      return;
    }

    const request: CreateClienteRequest = {
      nombre,
      nif,
      direccion,
      codigoPostal: this.codigoPostal().trim() || null,
      ciudad: this.ciudad().trim() || null,
      provincia: this.provincia().trim() || null,
      pais: this.pais().trim() || null,
      email: this.email().trim() || null,
      telefono: this.telefono().trim() || null,
      esAutonomoOProfesional: this.esAutonomoOProfesional(),
    };

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const id = this.editingId();
      if (id) {
        await this.clientesService.update(id, request);
      } else {
        await this.clientesService.create(request);
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
    this.nombre.set('');
    this.nif.set('');
    this.direccion.set('');
    this.codigoPostal.set('');
    this.ciudad.set('');
    this.provincia.set('');
    this.pais.set('España');
    this.email.set('');
    this.telefono.set('');
    this.esAutonomoOProfesional.set(false);
  }
}
```

`frontend/src/app/features/clientes/cliente-form-modal.html`:

```html
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">{{ editingId() ? 'Editar cliente' : 'Nuevo cliente' }}</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Nombre *
      <input
        [ngModel]="nombre()"
        (ngModelChange)="nombre.set($event)"
        name="nombre"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      NIF *
      <input
        [ngModel]="nif()"
        (ngModelChange)="nif.set($event)"
        name="nif"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Dirección *
      <input
        [ngModel]="direccion()"
        (ngModelChange)="direccion.set($event)"
        name="direccion"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Código postal
      <input
        [ngModel]="codigoPostal()"
        (ngModelChange)="codigoPostal.set($event)"
        name="codigoPostal"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Ciudad
      <input
        [ngModel]="ciudad()"
        (ngModelChange)="ciudad.set($event)"
        name="ciudad"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Provincia
      <input
        [ngModel]="provincia()"
        (ngModelChange)="provincia.set($event)"
        name="provincia"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      País
      <input
        [ngModel]="pais()"
        (ngModelChange)="pais.set($event)"
        name="pais"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Email
      <input
        [ngModel]="email()"
        (ngModelChange)="email.set($event)"
        name="email"
        type="email"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Teléfono
      <input
        [ngModel]="telefono()"
        (ngModelChange)="telefono.set($event)"
        name="telefono"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex items-center gap-2 text-sm text-slate-600">
      <input
        [ngModel]="esAutonomoOProfesional()"
        (ngModelChange)="esAutonomoOProfesional.set($event)"
        name="esAutonomoOProfesional"
        type="checkbox"
      />
      Autónomo o profesional
    </label>

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

`frontend/src/app/features/clientes/cliente-form-modal.css`:

```css
/* Cliente form modal styles */
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `ClienteFormModal` tests green.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/features/clientes/cliente-form-modal.ts src/app/features/clientes/cliente-form-modal.html src/app/features/clientes/cliente-form-modal.css src/app/features/clientes/cliente-form-modal.spec.ts
git commit -m "feat(clientes): add ClienteFormModal component"
```

---

### Task 3: Clientes list component

**Files:**
- Create: `frontend/src/app/features/clientes/clientes.ts`
- Create: `frontend/src/app/features/clientes/clientes.html`
- Create: `frontend/src/app/features/clientes/clientes.css`
- Test: `frontend/src/app/features/clientes/clientes.spec.ts`

**Interfaces:**
- Consumes: `ClientesService` (Task 1) — `clientes`, `isLoading`, `errorMessage` signals, `load()`, `remove(id)`; `ClienteFormModal` (Task 2) — `openForCreate()`, `openForEdit(cliente)`; `Cliente` model.
- Produces (used by Task 4 routing): component `Clientes`, selector `app-clientes`.

- [ ] **Step 1: Write the failing tests for `Clientes`**

`frontend/src/app/features/clientes/clientes.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Clientes } from './clientes';
import { ClientesService } from './clientes.service';
import { ClienteFormModal } from './cliente-form-modal';
import { Cliente } from '../../core/models/cliente.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: '28001',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  pais: 'España',
  email: 'acme@example.com',
  telefono: '600111222',
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const cliente2: Cliente = {
  id: 'c2',
  nombre: 'Beta Autónomo',
  nif: '12345678Z',
  direccion: 'Av. Libertad 5',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: 'España',
  email: null,
  telefono: null,
  esAutonomoOProfesional: true,
  createdAt: '2026-01-02T00:00:00Z',
};

describe('Clientes', () => {
  let component: Clientes;
  let clientesServiceStub: {
    clientes: ReturnType<typeof signal<Cliente[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let modalStub: { openForCreate: ReturnType<typeof vi.fn>; openForEdit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clientesServiceStub = {
      clientes: signal<Cliente[]>([cliente1, cliente2]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    modalStub = { openForCreate: vi.fn(), openForEdit: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: ClientesService, useValue: clientesServiceStub }],
    });

    component = TestBed.createComponent(Clientes).componentInstance;
    component.modal = modalStub as unknown as ClienteFormModal;
  });

  it('ngOnInit() loads clientes', () => {
    component.ngOnInit();
    expect(clientesServiceStub.load).toHaveBeenCalled();
  });

  it('filteredClientes() returns all clientes when searchTerm is empty', () => {
    expect(component.filteredClientes()).toEqual([cliente1, cliente2]);
  });

  it('filteredClientes() filters by nombre, case-insensitively', () => {
    component.searchTerm.set('acme');
    expect(component.filteredClientes()).toEqual([cliente1]);
  });

  it('filteredClientes() filters by nif', () => {
    component.searchTerm.set('12345678Z');
    expect(component.filteredClientes()).toEqual([cliente2]);
  });

  it('onNew() opens the modal in create mode', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  it('onEdit() opens the modal in edit mode with the given cliente', () => {
    component.onEdit(cliente1);
    expect(modalStub.openForEdit).toHaveBeenCalledWith(cliente1);
  });

  it('onDelete() does nothing when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.onDelete(cliente1);
    expect(clientesServiceStub.remove).not.toHaveBeenCalled();
  });

  it('onDelete() calls remove() with the cliente id when the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await component.onDelete(cliente1);
    expect(clientesServiceStub.remove).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `Cannot find module './clientes'`.

- [ ] **Step 3: Implement `Clientes`**

`frontend/src/app/features/clientes/clientes.ts`:

```ts
import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesService } from './clientes.service';
import { ClienteFormModal } from './cliente-form-modal';
import { Cliente } from '../../core/models/cliente.models';

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, ClienteFormModal],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes implements OnInit {
  protected readonly clientesService = inject(ClientesService);

  @ViewChild(ClienteFormModal) modal!: ClienteFormModal;

  readonly searchTerm = signal('');

  readonly filteredClientes = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const clientes = this.clientesService.clientes();
    if (!term) {
      return clientes;
    }
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(term) || c.nif.toLowerCase().includes(term),
    );
  });

  ngOnInit(): void {
    void this.clientesService.load();
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  onEdit(cliente: Cliente): void {
    this.modal.openForEdit(cliente);
  }

  async onDelete(cliente: Cliente): Promise<void> {
    if (!confirm(`¿Eliminar a ${cliente.nombre}?`)) {
      return;
    }
    await this.clientesService.remove(cliente.id);
  }

  onSaved(): void {
    // No-op: ClientesService.create()/update() already reload the list themselves,
    // and the modal closes itself on success. Bound to (saved) only so the modal's
    // documented output has a consumer.
  }
}
```

`frontend/src/app/features/clientes/clientes.html`:

```html
<div class="mx-auto max-w-4xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Clientes</h1>
    <button type="button" (click)="onNew()" class="rounded bg-slate-900 px-4 py-2 text-sm text-white">
      Nuevo cliente
    </button>
  </div>

  <input
    [ngModel]="searchTerm()"
    (ngModelChange)="searchTerm.set($event)"
    name="searchTerm"
    type="text"
    placeholder="Buscar por nombre o NIF…"
    class="mb-4 w-full rounded border border-slate-300 px-3 py-2 sm:w-80"
  />

  @if (clientesService.errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ clientesService.errorMessage() }}</p>
  }

  @if (clientesService.isLoading()) {
    <p class="text-sm text-slate-500">Cargando…</p>
  } @else if (filteredClientes().length > 0) {
    <table class="w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Nombre</th>
          <th class="py-2">NIF</th>
          <th class="py-2">Email</th>
          <th class="py-2">Teléfono</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (cliente of filteredClientes(); track cliente.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2">{{ cliente.nombre }}</td>
            <td class="py-2">{{ cliente.nif }}</td>
            <td class="py-2">{{ cliente.email || '—' }}</td>
            <td class="py-2">{{ cliente.telefono || '—' }}</td>
            <td class="py-2 text-right">
              <button type="button" (click)="onEdit(cliente)" class="mr-3 text-slate-600 hover:underline">
                Editar
              </button>
              <button type="button" (click)="onDelete(cliente)" class="text-red-600 hover:underline">
                Eliminar
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  } @else {
    <p class="text-sm text-slate-500">Todavía no hay clientes — creá el primero arriba.</p>
  }

  <app-cliente-form-modal (saved)="onSaved()" />
</div>
```

`frontend/src/app/features/clientes/clientes.css`:

```css
/* Clientes list styles */
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `Clientes` tests green.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/features/clientes/clientes.ts src/app/features/clientes/clientes.html src/app/features/clientes/clientes.css src/app/features/clientes/clientes.spec.ts
git commit -m "feat(clientes): add Clientes list component"
```

---

### Task 4: Wire up routing and navigation

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/layout/layout.html`

**Interfaces:**
- Consumes: `Clientes` component from Task 3.
- Produces: route `/clientes` reachable from the app; no new exported symbols.

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import and the child route:

```ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';
import { Login } from './features/login/login';
import { BusinessSearch } from './features/business-search/business-search';
import { SearchHistory } from './features/search-history/search-history';
import { GeneratedWebsites } from './features/generated-websites/generated-websites';
import { Clientes } from './features/clientes/clientes';
import { Layout } from './shared/layout/layout';
import { NotFound } from './shared/not-found/not-found';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: 'search', component: BusinessSearch },
      { path: 'history', component: SearchHistory },
      { path: 'websites', component: GeneratedWebsites },
      { path: 'clientes', component: Clientes },
      { path: '', pathMatch: 'full', redirectTo: 'search' },
    ],
  },
  { path: '**', component: NotFound },
];
```

- [ ] **Step 2: Add the nav link**

In `frontend/src/app/shared/layout/layout.html`, add a link after "Sitios":

```html
<div class="flex gap-4 text-sm font-medium">
  <a routerLink="/search" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
    Buscar
  </a>
  <a routerLink="/history" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
    Historial
  </a>
  <a routerLink="/websites" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
    Sitios
  </a>
  <a routerLink="/clientes" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
    Clientes
  </a>
</div>
```

- [ ] **Step 3: Run the full test suite**

Run (from `frontend/`): `npm test`
Expected: PASS — no regressions in `layout.spec.ts`, `app.spec.ts`, or any other existing spec.

- [ ] **Step 4: Build to confirm the route compiles cleanly**

Run (from `frontend/`): `npm run build`
Expected: build succeeds with no TypeScript or template errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/app.routes.ts src/app/shared/layout/layout.html
git commit -m "feat(clientes): wire up /clientes route and nav link"
```

---

## Final Verification

- [ ] Run the full suite once more from `frontend/`: `npm test` — expect all files passing (13 pre-existing + 3 new spec files, previously 50 tests plus the new ones from Tasks 1–3).
- [ ] Run `npm run build` from `frontend/` — expect a clean build.
- [ ] Manually smoke-test in the browser: `npm start` (proxies `/api` to the backend per `proxy.conf.json` — confirm the backend is running locally first), log in, click "Clientes" in the nav, create a cliente, edit it, search for it by NIF, and delete it (and separately verify the 409 message appears when deleting a cliente that has a factura/presupuesto, if any test data exists for that).
