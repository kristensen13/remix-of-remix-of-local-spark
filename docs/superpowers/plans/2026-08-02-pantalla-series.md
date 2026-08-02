# Pantalla de Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Series screen (list + create only — no edit/delete) in the Angular frontend, consuming the existing `/api/series` GET/POST backend.

**Architecture:** A `SeriesService` holds signal-based state (`series`, `isLoading`, `errorMessage`) and talks to `/api/series` via `HttpClient`. A `Series` list component renders a simple (unfiltered) table and delegates create to a `SerieFormModal` component built on the native `<dialog>` element, controlled imperatively via `@ViewChild`. This is the second of three new screens (Series → Presupuestos → Facturas) and establishes the `output()`-based convention the other two will follow. The screen is added as a new protected route with a nav link.

**Tech Stack:** Angular 22 standalone components, signals, `output()`, `FormsModule`/`ngModel`, Tailwind utility classes, Vitest (`@angular/build:unit-test`), native `HTMLDialogElement`.

**Spec:** `docs/superpowers/specs/2026-08-02-pantalla-series-design.md`

## Global Constraints

- Follow existing project conventions exactly: standalone components, one folder per feature under `src/app/features/`, `.ts` + `.html` + `.css` + `.spec.ts` split into separate files (never inline templates/styles).
- State lives in signals inside an injectable service (`@Service()` decorator — this project's alias for `@Injectable()`), exposed as `readonly` to components.
- HTTP calls use `HttpClient` + `firstValueFrom` (no `.subscribe()`).
- Errors are formatted with the existing `extractErrorMessage()` from `core/http-error.util.ts` — do not modify that file.
- Forms use `FormsModule` + `[ngModel]`/`(ngModelChange)` two-way binding (banana-in-a-box), never Reactive Forms.
- Tailwind utility classes inline in templates; no new CSS framework or component library.
- No new npm dependencies — the modal is a hand-rolled `<dialog>`-based component.
- New routes nest under the existing `Layout` component, guarded by `authGuard`, inside `app.routes.ts`.
- **New convention starting with this screen:** component outputs use the native `output()` function (`readonly saved = output<void>();`), not `@Output() = new EventEmitter()`. In tests, `output()` refs are asserted the same way as `EventEmitter` — `component.saved.subscribe(spy)` works on both.
- **New convention starting with this screen:** the list component injects and exposes the whole service to the template (`protected readonly seriesService = inject(SeriesService);`), matching the Clientes pattern — not re-exposing individual signals.
- **New convention starting with this screen:** the form modal uses one signal per form field (matching `cliente-form-modal.ts`), even though `FormValue`-object-as-single-signal is the leaner alternative — chosen for consistency, the Series form is small (4 fields).
- **jsdom in this project does not implement `HTMLDialogElement.showModal()`/`close()`.** Any component that calls these methods must expose the `ElementRef` as a normal (non-`private`) `@ViewChild` so tests can replace it with a `{ nativeElement: { showModal: vi.fn(), close: vi.fn() } }` stub — do not attempt to render the real dialog in tests.
- Existing component tests in this codebase never call `fixture.detectChanges()` except where explicitly rendering the DOM tree (see Clientes' "template rendering" describe block) — construct components with `TestBed.createComponent(X).componentInstance` and assign `@ViewChild` references / stub services by hand otherwise.
- Backend `SeriesController` exposes only `GET /api/series` and `POST /api/series` — **do not add PUT/DELETE endpoints or touch the backend** in this plan. No edit, no delete, no search/filter UI.
- Out of scope: Presupuestos and Facturas screens (separate specs/plans), PDF generation, the anulación endpoint.
- Run tests from `frontend/` with `npm test` (runs once, not in watch mode — confirmed: 16 files / 75 tests pass on the current baseline before this plan's changes).

---

### Task 1: Serie models + SeriesService

**Files:**
- Create: `frontend/src/app/core/models/serie.models.ts`
- Create: `frontend/src/app/features/series/series.service.ts`
- Test: `frontend/src/app/features/series/series.service.spec.ts`

**Interfaces:**
- Consumes: nothing new (only `HttpClient`, `extractErrorMessage` from `core/http-error.util.ts`).
- Produces (used by Tasks 2 and 3):
  - `Serie` — `{ id: string; codigo: string; descripcion: string | null; ultimoNumero: number; anio: number; esRectificativa: boolean }`
  - `CreateSerieRequest` — `{ codigo: string; descripcion: string | null; anio: number; esRectificativa: boolean }`
  - `SeriesService` — `series: Signal<Serie[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `load(): Promise<void>`, `create(request: CreateSerieRequest): Promise<Serie>`

- [ ] **Step 1: Write the model file**

```typescript
// frontend/src/app/core/models/serie.models.ts
export interface Serie {
  id: string;
  codigo: string;
  descripcion: string | null;
  ultimoNumero: number;
  anio: number;
  esRectificativa: boolean;
}

export interface CreateSerieRequest {
  codigo: string;
  descripcion: string | null;
  anio: number;
  esRectificativa: boolean;
}
```

- [ ] **Step 2: Write the failing tests for `SeriesService`**

```typescript
// frontend/src/app/features/series/series.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SeriesService } from './series.service';
import { Serie, CreateSerieRequest } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2026,
  esRectificativa: false,
};

const createRequest: CreateSerieRequest = {
  codigo: 'A',
  descripcion: 'Serie general',
  anio: 2026,
  esRectificativa: false,
};

describe('SeriesService', () => {
  let service: SeriesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SeriesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SeriesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads series on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    req.flush([serie1]);
    await loadPromise;

    expect(service.series()).toEqual([serie1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created serie', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(serie1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    getReq.flush([serie1]);

    const result = await createPromise;
    expect(result).toEqual(serie1);
    expect(service.series()).toEqual([serie1]);
  });

  it('create() rejects with a 400 and does not reload the list on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    postReq.flush({ message: 'El código de serie es obligatorio.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/series' && r.method === 'GET')).toHaveLength(0);
  });

  it('create() rejects with a 409 on duplicate código+año and does not reload the list', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    postReq.flush(
      { message: 'Ya existe una serie con ese código para ese año.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/series' && r.method === 'GET')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `series.service.ts` does not exist yet (module not found).

- [ ] **Step 4: Write the minimal `SeriesService` implementation**

```typescript
// frontend/src/app/features/series/series.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Serie, CreateSerieRequest } from '../../core/models/serie.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class SeriesService {
  private readonly http = inject(HttpClient);

  readonly series = signal<Serie[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const series = await firstValueFrom(this.http.get<Serie[]>('/api/series'));
      this.series.set(series);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreateSerieRequest): Promise<Serie> {
    const serie = await firstValueFrom(this.http.post<Serie>('/api/series', request));
    await this.load();
    return serie;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `SeriesService` tests green, no regressions in the other 75 existing tests.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/app/core/models/serie.models.ts src/app/features/series/series.service.ts src/app/features/series/series.service.spec.ts
git commit -m "feat(series): add Serie models and SeriesService"
```

---

### Task 2: SerieFormModal

**Files:**
- Create: `frontend/src/app/features/series/serie-form-modal.ts`
- Create: `frontend/src/app/features/series/serie-form-modal.html`
- Create: `frontend/src/app/features/series/serie-form-modal.css`
- Test: `frontend/src/app/features/series/serie-form-modal.spec.ts`

**Interfaces:**
- Consumes: `SeriesService.create()` (Task 1), `extractErrorMessage()` from `core/http-error.util.ts`, `Serie`/`CreateSerieRequest` from `core/models/serie.models.ts`.
- Produces (used by Task 3): `SerieFormModal` component, selector `app-serie-form-modal`, with public methods `openForCreate(): void`, `cancel(): void`, `onSubmit(): Promise<void>`, output `readonly saved = output<void>()`, and `@ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>`.

- [ ] **Step 1: Write the failing tests for `SerieFormModal`**

```typescript
// frontend/src/app/features/series/serie-form-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { SerieFormModal } from './serie-form-modal';
import { SeriesService } from './series.service';
import { Serie } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2025,
  esRectificativa: false,
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('SerieFormModal', () => {
  let component: SerieFormModal;
  let seriesServiceStub: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    seriesServiceStub = {
      create: vi.fn().mockResolvedValue(serie1),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SeriesService, useValue: seriesServiceStub }],
    });

    component = TestBed.createComponent(SerieFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form to defaults (año = current year) and shows the dialog', () => {
    component.codigo.set('leftover');
    component.anio.set(1999);
    component.openForCreate();

    expect(component.codigo()).toBe('');
    expect(component.descripcion()).toBe('');
    expect(component.anio()).toBe(new Date().getFullYear());
    expect(component.esRectificativa()).toBe(false);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when código is blank', async () => {
    component.openForCreate();
    component.codigo.set('   ');

    await component.onSubmit();

    expect(component.formError()).toBe('El código de serie es obligatorio.');
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() calls create(), closes the dialog, and emits saved', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);
    component.openForCreate();
    component.codigo.set('A');
    component.descripcion.set('Serie general');
    component.anio.set(2026);

    await component.onSubmit();

    expect(seriesServiceStub.create).toHaveBeenCalledWith({
      codigo: 'A',
      descripcion: 'Serie general',
      anio: 2026,
      esRectificativa: false,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('onSubmit() sends null descripcion when left blank', async () => {
    component.openForCreate();
    component.codigo.set('A');

    await component.onSubmit();

    expect(seriesServiceStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: null }),
    );
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    seriesServiceStub.create.mockRejectedValue({
      error: { message: 'Ya existe una serie con ese código para ese año.' },
    });
    component.openForCreate();
    component.codigo.set('A');

    await component.onSubmit();

    expect(component.formError()).toBe('Ya existe una serie con ese código para ese año.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `serie-form-modal.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the minimal `SerieFormModal` implementation**

```typescript
// frontend/src/app/features/series/serie-form-modal.ts
import { Component, ElementRef, ViewChild, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SeriesService } from './series.service';
import { CreateSerieRequest } from '../../core/models/serie.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-serie-form-modal',
  imports: [FormsModule],
  templateUrl: './serie-form-modal.html',
  styleUrl: './serie-form-modal.css',
})
export class SerieFormModal {
  private readonly seriesService = inject(SeriesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly codigo = signal('');
  readonly descripcion = signal('');
  readonly anio = signal(new Date().getFullYear());
  readonly esRectificativa = signal(false);

  openForCreate(): void {
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const codigo = this.codigo().trim();

    if (!codigo) {
      this.formError.set('El código de serie es obligatorio.');
      return;
    }

    const request: CreateSerieRequest = {
      codigo,
      descripcion: this.descripcion().trim() || null,
      anio: this.anio(),
      esRectificativa: this.esRectificativa(),
    };

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      await this.seriesService.create(request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private resetForm(): void {
    this.codigo.set('');
    this.descripcion.set('');
    this.anio.set(new Date().getFullYear());
    this.esRectificativa.set(false);
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/features/series/serie-form-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Nueva serie</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Código *
      <input
        [ngModel]="codigo()"
        (ngModelChange)="codigo.set($event)"
        name="codigo"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Descripción
      <input
        [ngModel]="descripcion()"
        (ngModelChange)="descripcion.set($event)"
        name="descripcion"
        type="text"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Año *
      <input
        [ngModel]="anio()"
        (ngModelChange)="anio.set($event)"
        name="anio"
        type="number"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex items-center gap-2 text-sm text-slate-600">
      <input
        [ngModel]="esRectificativa()"
        (ngModelChange)="esRectificativa.set($event)"
        name="esRectificativa"
        type="checkbox"
      />
      Es rectificativa
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

- [ ] **Step 5: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/series/serie-form-modal.css */
/* Serie form modal styles */
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `SerieFormModal` tests green, no regressions.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/features/series/serie-form-modal.ts src/app/features/series/serie-form-modal.html src/app/features/series/serie-form-modal.css src/app/features/series/serie-form-modal.spec.ts
git commit -m "feat(series): add SerieFormModal component"
```

---

### Task 3: Series list component

**Files:**
- Create: `frontend/src/app/features/series/series.ts`
- Create: `frontend/src/app/features/series/series.html`
- Create: `frontend/src/app/features/series/series.css`
- Test: `frontend/src/app/features/series/series.spec.ts`

**Interfaces:**
- Consumes: `SeriesService` (Task 1) — `series`, `isLoading`, `errorMessage` signals, `load()`; `SerieFormModal` (Task 2) — `openForCreate()`, output `saved`.
- Produces (used by Task 4): `Series` component, selector `app-series`, with `ngOnInit(): void` and `onNew(): void`.

- [ ] **Step 1: Write the failing tests for `Series`**

```typescript
// frontend/src/app/features/series/series.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Series } from './series';
import { SeriesService } from './series.service';
import { SerieFormModal } from './serie-form-modal';
import { Serie } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2026,
  esRectificativa: false,
};

const serie2: Serie = {
  id: 's2',
  codigo: 'R',
  descripcion: null,
  ultimoNumero: 0,
  anio: 2026,
  esRectificativa: true,
};

describe('Series', () => {
  let component: Series;
  let seriesServiceStub: {
    series: ReturnType<typeof signal<Serie[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
  };
  let modalStub: { openForCreate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    seriesServiceStub = {
      series: signal<Serie[]>([serie1, serie2]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
    };
    modalStub = { openForCreate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: SeriesService, useValue: seriesServiceStub }],
    });

    component = TestBed.createComponent(Series).componentInstance;
    component.modal = modalStub as unknown as SerieFormModal;
  });

  it('ngOnInit() loads series', () => {
    component.ngOnInit();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('onNew() opens the modal', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  describe('template rendering', () => {
    it('renders one table row per serie', () => {
      const localStub = {
        series: signal<Serie[]>([serie1, serie2]),
        isLoading: signal(false),
        errorMessage: signal<string | null>(null),
        load: vi.fn().mockResolvedValue(undefined),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: SeriesService, useValue: localStub }],
      });

      const fixture = TestBed.createComponent(Series);
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('A');
      expect(text).toContain('Serie general');
      expect(text).toContain('R');
    });

    it('shows the empty-state message when there are no series', () => {
      const localStub = {
        series: signal<Serie[]>([]),
        isLoading: signal(false),
        errorMessage: signal<string | null>(null),
        load: vi.fn().mockResolvedValue(undefined),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: SeriesService, useValue: localStub }],
      });

      const fixture = TestBed.createComponent(Series);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay series — creá la primera con "Nueva serie".');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `series.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the minimal `Series` implementation**

```typescript
// frontend/src/app/features/series/series.ts
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { SeriesService } from './series.service';
import { SerieFormModal } from './serie-form-modal';

@Component({
  selector: 'app-series',
  imports: [SerieFormModal],
  templateUrl: './series.html',
  styleUrl: './series.css',
})
export class Series implements OnInit {
  protected readonly seriesService = inject(SeriesService);

  @ViewChild(SerieFormModal) modal!: SerieFormModal;

  ngOnInit(): void {
    void this.seriesService.load();
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  onSaved(): void {
    // No-op: SeriesService.create() already reloads the list itself,
    // and the modal closes itself on success. Bound to (saved) only so the
    // modal's documented output has a consumer.
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/features/series/series.html -->
<div class="mx-auto max-w-4xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Series</h1>
    <button type="button" (click)="onNew()" class="rounded bg-slate-900 px-4 py-2 text-sm text-white">
      Nueva serie
    </button>
  </div>

  @if (seriesService.errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ seriesService.errorMessage() }}</p>
  }

  @if (seriesService.isLoading()) {
    <p class="text-sm text-slate-500">Cargando…</p>
  } @else if (seriesService.series().length > 0) {
    <table class="w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Código</th>
          <th class="py-2">Descripción</th>
          <th class="py-2">Año</th>
          <th class="py-2">Rectificativa</th>
          <th class="py-2">Último número</th>
        </tr>
      </thead>
      <tbody>
        @for (serie of seriesService.series(); track serie.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2">{{ serie.codigo }}</td>
            <td class="py-2">{{ serie.descripcion || '—' }}</td>
            <td class="py-2">{{ serie.anio }}</td>
            <td class="py-2">{{ serie.esRectificativa ? 'Sí' : 'No' }}</td>
            <td class="py-2">{{ serie.ultimoNumero }}</td>
          </tr>
        }
      </tbody>
    </table>
  } @else {
    <p class="text-sm text-slate-500">Todavía no hay series — creá la primera con "Nueva serie".</p>
  }

  <app-serie-form-modal (saved)="onSaved()" />
</div>
```

- [ ] **Step 5: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/series/series.css */
/* Series list styles */
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS — all `Series` tests green, no regressions.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/features/series/series.ts src/app/features/series/series.html src/app/features/series/series.css src/app/features/series/series.spec.ts
git commit -m "feat(series): add Series list component"
```

---

### Task 4: Route + nav wiring

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/layout/layout.html`

**Interfaces:**
- Consumes: `Series` component (Task 3).
- Produces: nothing consumed by later tasks (this plan's last task).

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import and the child route:

```typescript
import { Series } from './features/series/series';
```

```typescript
      { path: 'clientes', component: Clientes },
      { path: 'series', component: Series },
```

- [ ] **Step 2: Add the nav link**

In `frontend/src/app/shared/layout/layout.html`, add after the Clientes link:

```html
      <a routerLink="/series" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Series
      </a>
```

- [ ] **Step 3: Run the full test suite**

Run (from `frontend/`): `npm test`
Expected: PASS — 19 files / 90 tests (16+3 new spec files: `series.service.spec.ts` 5 tests, `serie-form-modal.spec.ts` 6 tests, `series.spec.ts` 4 tests = 75+15), no regressions.

- [ ] **Step 4: Manually verify in the browser**

With backend (`dotnet run --urls http://localhost:5091` from `backend/LocaleBoost.Api`) and frontend (`npm start` from `frontend/`) running, log in, navigate to `/series`, confirm:
- Empty state shows correctly on a fresh account.
- "Nueva serie" opens the modal, año defaults to the current year.
- Submitting with a blank código shows the validation message and does not call the backend.
- Submitting a valid serie closes the modal and the new row appears in the table.
- Submitting a second serie with the same código+año shows the 409 message from the backend and keeps the modal open.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/app.routes.ts src/app/shared/layout/layout.html
git commit -m "feat(series): wire up /series route and nav link"
```
