# Angular Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Angular SPA (login/register, business search, search history, generated-website listing) described in `docs/superpowers/specs/2026-07-21-angular-dotnet-rebuild-design.md` and `docs/superpowers/specs/2026-07-27-angular-frontend-design.md`, talking to the already-implemented, already-merged backend API (`backend/LocaleBoost.Api`, `origin/main` at `af775f6`) over relative `/api/*` URLs.

**Architecture:** Standalone Angular components (no NgModules), signals for service state, a functional `HttpInterceptorFn` attaching the JWT and handling 401s, a functional `CanActivateFn` guard, Tailwind CSS for styling with hand-built components (no UI library). All HTTP calls target relative `/api/*` paths — same-origin in production (per the deployment plan, not yet written) and proxied to the local backend during development.

**Tech Stack:** Angular 22 (installed via `npx @angular/cli@latest`), standalone components, Tailwind CSS v4 (via the CLI's built-in `--style=tailwind` integration), Vitest as the unit test runner, `HttpTestingController` for HTTP mocking.

## ⚠️ Read this before touching any file

This plan targets **Angular CLI v22**, empirically verified in this environment on 2026-07-27 by scaffolding a throwaway project and inspecting its actual output — not assumed from older Angular knowledge. Several things below will look wrong if your training data predates this Angular version. They are not typos:

- **No NgModules, ever.** Every component/service/etc. is standalone; there is no `app.module.ts`.
- **2025 file-naming style guide (the CLI's actual default for this version):** component files have **no `.component` suffix** — `login.ts` / `login.html` / `login.css`, class `Login`, not `LoginComponent`. Guards/interceptors get a **dash** suffix — `auth-guard.ts` (not `auth.guard.ts`), exporting `authGuard`. This plan deviates from that default in exactly one place, deliberately: **services keep an explicit `.service.ts` file suffix and `Service` class suffix** (`business-search.service.ts` / `BusinessSearchService`), because this app has a service and a component that would otherwise share the exact same bare name in the exact same feature folder (e.g. `BusinessSearch` the component vs `BusinessSearch` the service) — the CLI's own bare-name default doesn't anticipate that collision. Follow the exact file names given in each task; don't "correct" them back to `.component.ts`/`.service.ts`-for-everything or forward to fully bare names.
- **`@Service()` replaces `@Injectable({ providedIn: 'root' })`.** It's a real decorator exported from `@angular/core` in this version, auto-provided as a root singleton by default (no `providedIn` option needed). Verified empirically: `ng generate service` in this CLI emits `@Service()`, and `TestBed.inject(...)` resolves it with zero explicit providers, exactly like the old `providedIn: 'root'` pattern.
- **Zoneless by default.** `ng new` in this version does not install `zone.js` and does not add any zone provider. Signals drive change detection. Don't add `zone.js` or `provideZoneChangeDetection`.
- **Vitest, not Jasmine/Karma.** `describe`, `it`, `expect`, and `vi` are global in spec files (via `tsconfig.spec.json`'s `"types": ["vitest/globals"]`) — no imports needed for them. Mocking uses `vi.fn()` / `vi.spyOn()`, not `jasmine.createSpyObj`. Run tests with `npx ng test --watch=false` for a single non-interactive run.
- **Tailwind v4 is a first-class `ng new` option** (`--style=tailwind`) — it wires up `.postcssrc.json` and `@import 'tailwindcss';` in `styles.css` for you. Don't hand-roll a `tailwind.config.ts` (that's the old v3 setup).
- **Control flow (`@if`, `@for`) is built into the template compiler** — don't import `CommonModule` just to use them. Only import `@angular/common` symbols you actually use as pipes/directives (e.g. `DatePipe`).

If, when you actually run these commands, the installed CLI behaves differently from what's documented here (a newer/older Angular version got installed, a flag was renamed, etc.), stop and report the discrepancy rather than silently reconciling it — don't guess.

## Global Constraints

- All frontend code lives under `frontend/` at the repo root, sibling to `backend/`.
- Standalone components only, no NgModules.
- Signals for all service-held state (search results, listings, loading/error flags) — not RxJS `BehaviorSubject`/`async` pipe.
- All HTTP calls use relative paths (`/api/...`), never an absolute base URL — same-origin in production, proxied in dev (Task 1 sets up the dev proxy).
- No UI component library (no Angular Material, no shadcn/Radix port) — Tailwind utility classes + hand-built components only.
- No per-user rate limiting, no toast/notification system, no e2e tests — all explicitly deferred per the specs.
- Every step that runs tests uses `npx ng test --watch=false` (single run, not watch mode).

---

### Task 1: Workspace scaffold, remove the old app, dev proxy

**Files:**
- Remove (tracked, old React app): `.env.example`, `components.json`, `eslint.config.js`, `index.html`, `package-lock.json`, `package.json`, `postcss.config.js`, `public/`, `README.md`, `src/`, `supabase/`, `tailwind.config.ts`, `tsconfig.app.json`, `tsconfig.json`, `tsconfig.node.json`, `vercel.json`, `vite.config.ts`
- Remove (untracked, old React app / Vercel linkage): `node_modules/`, `dist/`, `.vercel/`, `.env`, `.env.local`
- Keep as-is: `.gitignore` (repo-wide, still needed), `global.json` (.NET SDK pin, unrelated to the React app), `backend/`, `docs/`, `.claude/`
- Create: `frontend/` (via `ng new`, see steps)
- Create: `frontend/proxy.conf.json`
- Modify: `frontend/package.json` (`start` script)

**Interfaces:**
- Produces: a working `frontend/` Angular workspace — `npx ng build` and `npx ng test --watch=false` both succeed — that every later task adds files into.

- [ ] **Step 1: Remove the old React/Vite/Supabase app**

From the repo root:

```bash
git rm -r .env.example components.json eslint.config.js index.html package-lock.json package.json postcss.config.js public README.md src supabase tailwind.config.ts tsconfig.app.json tsconfig.json tsconfig.node.json vercel.json vite.config.ts
rm -rf node_modules dist .vercel .env .env.local
```

- [ ] **Step 2: Scaffold the Angular workspace**

```bash
npx -y @angular/cli@latest new frontend --style=tailwind --routing --skip-git --defaults --package-manager=npm
```

This creates `frontend/` with `src/app/app.ts`, `app.html`, `app.css`, `app.config.ts`, `app.routes.ts`, Tailwind already wired (`.postcssrc.json`, `@import 'tailwindcss';` in `src/styles.css`), Vitest as the test runner, and no `zone.js` dependency. Leave all of this generated content as-is for now — later tasks modify `app.ts`, `app.html`, `app.config.ts`, and `app.routes.ts`.

- [ ] **Step 3: Verify the generated project builds and its default tests pass**

```bash
cd frontend
npx ng build
npx ng test --watch=false
```

Expected: `ng build` prints `Application bundle generation complete.` with an `Output location`. `ng test --watch=false` prints `Test Files  1 passed (1)` / `Tests  2 passed (2)` (the CLI's own generated `app.spec.ts`).

- [ ] **Step 4: Add the dev proxy to the backend**

Create `frontend/proxy.conf.json`:

```json
{
  "/api": {
    "target": "http://localhost:5091",
    "secure": false
  }
}
```

`http://localhost:5091` is the backend's local HTTP dev URL (`backend/LocaleBoost.Api/Properties/launchSettings.json`, `http` profile).

- [ ] **Step 5: Wire the proxy into the `start` script**

Open `frontend/package.json` and change:

```json
"start": "ng serve",
```

to:

```json
"start": "ng serve --proxy-config proxy.conf.json",
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add -A frontend .gitignore
git commit -m "chore: remove old React/Vite/Supabase app, scaffold Angular frontend"
```

(`git add -A frontend` picks up the whole new workspace including `.postcssrc.json`, `package.json`, etc. `-A` on the `frontend` pathspec only touches that directory — it won't accidentally restage something unrelated. If `git status` shows anything under `backend/` or `docs/` at this point, stop and investigate before committing — this task should touch only the root-level old-app files and the new `frontend/` directory.)

---

### Task 2: Core HTTP models, error helper, and `AuthService`

**Files:**
- Create: `frontend/src/app/core/models/auth.models.ts`
- Create: `frontend/src/app/core/http-error.util.ts`
- Create: `frontend/src/app/core/http-error.util.spec.ts`
- Create: `frontend/src/app/core/auth.service.ts`
- Create: `frontend/src/app/core/auth.service.spec.ts`

**Interfaces:**
- Produces: `LoginRequest { email: string; password: string }`, `RegisterRequest { email: string; password: string; inviteCode: string }`, `AuthResponse { token: string }` (in `auth.models.ts`) — field names are camelCase to match the backend's default System.Text.Json serialization (verified against `backend/LocaleBoost.Api/Dtos/Auth/*.cs`, which has no custom naming policy configured).
- Produces: `extractErrorMessage(error: HttpErrorResponse): string` (in `http-error.util.ts`) — reads the backend's two error shapes (`{ message }` from `BadRequest`/`Unauthorized`, `{ title }` from the `ProblemDetails` the global exception middleware emits for 502/500) and falls back to a generic message. Used by every feature service from Task 6 onward.
- Produces: `AuthService` (`@Service()`, root-provided) with `isAuthenticated: Signal<boolean>`, `token(): string | null`, `login(request): Promise<void>`, `register(request): Promise<void>`, `logout(): void`. Consumed by the interceptor (Task 3), the guard (Task 4), and `Login` (Task 5).

- [ ] **Step 1: Write the auth models**

```typescript
// frontend/src/app/core/models/auth.models.ts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  inviteCode: string;
}

export interface AuthResponse {
  token: string;
}
```

- [ ] **Step 2: Write the failing test for `extractErrorMessage`**

```typescript
// frontend/src/app/core/http-error.util.spec.ts
import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage } from './http-error.util';

describe('extractErrorMessage', () => {
  it('returns the backend "message" field when present', () => {
    const error = new HttpErrorResponse({
      error: { message: 'Invalid or already used invite code.' },
      status: 400,
    });

    expect(extractErrorMessage(error)).toBe('Invalid or already used invite code.');
  });

  it('falls back to the ProblemDetails "title" field when there is no "message"', () => {
    const error = new HttpErrorResponse({
      error: { title: "Couldn't complete the search, try again.", status: 502 },
      status: 502,
    });

    expect(extractErrorMessage(error)).toBe("Couldn't complete the search, try again.");
  });

  it('returns a generic message when the error body has neither field', () => {
    const error = new HttpErrorResponse({ error: null, status: 500 });

    expect(extractErrorMessage(error)).toBe('An unexpected error occurred. Please try again.');
  });
});
```

- [ ] **Step 2b: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './http-error.util'`.

- [ ] **Step 3: Implement `extractErrorMessage`**

```typescript
// frontend/src/app/core/http-error.util.ts
import { HttpErrorResponse } from '@angular/common/http';

export function extractErrorMessage(error: HttpErrorResponse): string {
  const body: unknown = error.error;

  if (body && typeof body === 'object') {
    const { message, title } = body as { message?: unknown; title?: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (typeof title === 'string') {
      return title;
    }
  }

  return 'An unexpected error occurred. Please try again.';
}
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Write the failing tests for `AuthService`**

```typescript
// frontend/src/app/core/auth.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts unauthenticated when no token is stored', () => {
    expect(service.isAuthenticated()).toBe(false);
  });

  it('login stores the token and flips isAuthenticated to true', async () => {
    const loginPromise = service.login({ email: 'a@b.com', password: 'secret123' });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'jwt-token-abc' });

    await loginPromise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token-abc');
    expect(localStorage.getItem('localeboost_token')).toBe('jwt-token-abc');
  });

  it('register stores the token and flips isAuthenticated to true', async () => {
    const registerPromise = service.register({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });

    const req = httpMock.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'jwt-token-xyz' });

    await registerPromise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token-xyz');
  });

  it('logout clears the token and navigates to /login', async () => {
    const loginPromise = service.login({ email: 'a@b.com', password: 'secret123' });
    httpMock.expectOne('/api/auth/login').flush({ token: 'jwt-token-abc' });
    await loginPromise;

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('localeboost_token')).toBeNull();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

```bash
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 7: Implement `AuthService`**

```typescript
// frontend/src/app/core/auth.service.ts
import { Service, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from './models/auth.models';

const TOKEN_STORAGE_KEY = 'localeboost_token';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  token(): string | null {
    return this.tokenSignal();
  }

  async login(request: LoginRequest): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>('/api/auth/login', request));
    this.setToken(response.token);
  }

  async register(request: RegisterRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/register', request),
    );
    this.setToken(response.token);
  }

  logout(): void {
    this.tokenSignal.set(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    this.router.navigateByUrl('/login');
  }

  private setToken(token: string): void {
    this.tokenSignal.set(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}
```

- [ ] **Step 8: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS — all `AuthService` and `extractErrorMessage` tests green.

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/src/app/core
git commit -m "feat(frontend): add auth models, HTTP error helper, and AuthService"
```

---

### Task 3: `authInterceptor`

**Files:**
- Create: `frontend/src/app/core/auth-interceptor.ts`
- Create: `frontend/src/app/core/auth-interceptor.spec.ts`

**Interfaces:**
- Consumes: `AuthService.token(): string | null`, `AuthService.logout(): void` (Task 2).
- Produces: `authInterceptor: HttpInterceptorFn`, exported for `app.config.ts` (Task 9) to register via `provideHttpClient(withInterceptors([authInterceptor]))`.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/auth-interceptor.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceStub: { token: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { token: vi.fn(), logout: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token when one is present', () => {
    authServiceStub.token.mockReturnValue('jwt-token-abc');

    httpClient.get('/api/websites').subscribe();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-token-abc');
    req.flush([]);
  });

  it('does not attach an Authorization header when there is no token', () => {
    authServiceStub.token.mockReturnValue(null);

    httpClient.get('/api/websites').subscribe();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('calls AuthService.logout() on a 401 response', () => {
    authServiceStub.token.mockReturnValue('expired-token');

    httpClient.get('/api/websites').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/websites');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceStub.logout).toHaveBeenCalled();
  });

  it('does not call logout() on a non-401 error', () => {
    authServiceStub.token.mockReturnValue('valid-token');

    httpClient.get('/api/websites').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/websites');
    req.flush({ title: 'Bad gateway' }, { status: 502, statusText: 'Bad Gateway' });

    expect(authServiceStub.logout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './auth-interceptor'`.

- [ ] **Step 3: Implement `authInterceptor`**

```typescript
// frontend/src/app/core/auth-interceptor.ts
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();

  const authorizedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorizedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    }),
  );
};
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/app/core/auth-interceptor.ts frontend/src/app/core/auth-interceptor.spec.ts
git commit -m "feat(frontend): add authInterceptor (bearer token + 401 logout)"
```

---

### Task 4: `authGuard`

**Files:**
- Create: `frontend/src/app/core/auth-guard.ts`
- Create: `frontend/src/app/core/auth-guard.spec.ts`

**Interfaces:**
- Consumes: `AuthService.isAuthenticated: Signal<boolean>` (Task 2).
- Produces: `authGuard: CanActivateFn`, exported for `app.routes.ts` (Task 9) to apply to the protected route group.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/auth-guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let authServiceStub: { isAuthenticated: ReturnType<typeof vi.fn> };
  let routerStub: { createUrlTree: ReturnType<typeof vi.fn> };
  let fakeUrlTree: UrlTree;

  beforeEach(() => {
    fakeUrlTree = {} as UrlTree;
    authServiceStub = { isAuthenticated: vi.fn() };
    routerStub = { createUrlTree: vi.fn().mockReturnValue(fakeUrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });
  });

  it('allows navigation when the user is authenticated', () => {
    authServiceStub.isAuthenticated.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
  });

  it('redirects to /login when the user is not authenticated', () => {
    authServiceStub.isAuthenticated.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBe(fakeUrlTree);
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './auth-guard'`.

- [ ] **Step 3: Implement `authGuard`**

```typescript
// frontend/src/app/core/auth-guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/app/core/auth-guard.ts frontend/src/app/core/auth-guard.spec.ts
git commit -m "feat(frontend): add authGuard"
```

---

### Task 5: `Login` component

**Files:**
- Create: `frontend/src/app/features/login/login.ts`
- Create: `frontend/src/app/features/login/login.html`
- Create: `frontend/src/app/features/login/login.css`
- Create: `frontend/src/app/features/login/login.spec.ts`

**Interfaces:**
- Consumes: `AuthService.login(LoginRequest): Promise<void>`, `AuthService.register(RegisterRequest): Promise<void>` (Task 2); `extractErrorMessage` (Task 2).
- Produces: `Login` component, routed at `/login` by Task 9.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/features/login/login.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../core/auth.service';

describe('Login', () => {
  let component: Login;
  let authServiceStub: { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
  let routerStub: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { login: vi.fn(), register: vi.fn() };
    routerStub = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });

    component = TestBed.createComponent(Login).componentInstance;
  });

  it('starts in login mode with no error message', () => {
    expect(component.mode()).toBe('login');
    expect(component.errorMessage()).toBeNull();
  });

  it('switching mode clears any error message', () => {
    component.errorMessage.set('some previous error');
    component.setMode('register');
    expect(component.mode()).toBe('register');
    expect(component.errorMessage()).toBeNull();
  });

  it('does not call AuthService.login when the login form is invalid', async () => {
    await component.submitLogin();
    expect(authServiceStub.login).not.toHaveBeenCalled();
  });

  it('logs in and navigates to /search on success', async () => {
    authServiceStub.login.mockResolvedValue(undefined);
    component.loginForm.setValue({ email: 'a@b.com', password: 'secret123' });

    await component.submitLogin();

    expect(authServiceStub.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/search');
    expect(component.errorMessage()).toBeNull();
  });

  it('shows the backend error message when login fails', async () => {
    authServiceStub.login.mockRejectedValue({ error: { message: 'Invalid email or password.' } });
    component.loginForm.setValue({ email: 'a@b.com', password: 'wrongpass' });

    await component.submitLogin();

    expect(component.errorMessage()).toBe('Invalid email or password.');
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not call AuthService.register when the register form is invalid', async () => {
    await component.submitRegister();
    expect(authServiceStub.register).not.toHaveBeenCalled();
  });

  it('registers and navigates to /search on success', async () => {
    authServiceStub.register.mockResolvedValue(undefined);
    component.registerForm.setValue({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });

    await component.submitRegister();

    expect(authServiceStub.register).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/search');
  });

  it('shows the backend error message when registration fails', async () => {
    authServiceStub.register.mockRejectedValue({
      error: { message: 'Invalid or already used invite code.' },
    });
    component.registerForm.setValue({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'USED',
    });

    await component.submitRegister();

    expect(component.errorMessage()).toBe('Invalid or already used invite code.');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './login'`.

- [ ] **Step 3: Implement `Login`**

```typescript
// frontend/src/app/features/login/login.ts
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { extractErrorMessage } from '../../core/http-error.util';

type LoginMode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<LoginMode>('login');
  readonly errorMessage = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    inviteCode: ['', [Validators.required]],
  });

  setMode(mode: LoginMode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.login(this.loginForm.getRawValue());
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    if (this.registerForm.invalid) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.register(this.registerForm.getRawValue());
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/features/login/login.html -->
<div class="flex min-h-screen items-center justify-center bg-slate-100 px-4">
  <div class="w-full max-w-sm rounded-lg bg-white p-8 shadow">
    <div class="mb-6 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded px-3 py-2 text-sm font-medium"
        [class.bg-slate-900]="mode() === 'login'"
        [class.text-white]="mode() === 'login'"
        [class.bg-slate-100]="mode() !== 'login'"
        (click)="setMode('login')"
      >
        Log in
      </button>
      <button
        type="button"
        class="flex-1 rounded px-3 py-2 text-sm font-medium"
        [class.bg-slate-900]="mode() === 'register'"
        [class.text-white]="mode() === 'register'"
        [class.bg-slate-100]="mode() !== 'register'"
        (click)="setMode('register')"
      >
        Register
      </button>
    </div>

    @if (errorMessage()) {
      <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
    }

    @if (mode() === 'login') {
      <form [formGroup]="loginForm" (ngSubmit)="submitLogin()" class="flex flex-col gap-4">
        <input
          formControlName="email"
          type="email"
          placeholder="Email"
          class="rounded border border-slate-300 px-3 py-2"
        />
        <input
          formControlName="password"
          type="password"
          placeholder="Password"
          class="rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          [disabled]="loginForm.invalid || isSubmitting()"
          class="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {{ isSubmitting() ? 'Logging in…' : 'Log in' }}
        </button>
      </form>
    } @else {
      <form [formGroup]="registerForm" (ngSubmit)="submitRegister()" class="flex flex-col gap-4">
        <input
          formControlName="email"
          type="email"
          placeholder="Email"
          class="rounded border border-slate-300 px-3 py-2"
        />
        <input
          formControlName="password"
          type="password"
          placeholder="Password (min 8 characters)"
          class="rounded border border-slate-300 px-3 py-2"
        />
        <input
          formControlName="inviteCode"
          type="text"
          placeholder="Invite code"
          class="rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          [disabled]="registerForm.invalid || isSubmitting()"
          class="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {{ isSubmitting() ? 'Registering…' : 'Register' }}
        </button>
      </form>
    }
  </div>
</div>
```

- [ ] **Step 5: Leave `login.css` empty** (styling is via Tailwind utility classes in the template) — the file is already created empty by Step 1; no content needed.

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npx ng test --watch=false
```

Expected: PASS — all `Login` tests green.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/src/app/features/login
git commit -m "feat(frontend): add Login component (login/register tabs)"
```

---

### Task 6: `BusinessSearchService` + `BusinessSearch` component

**Files:**
- Create: `frontend/src/app/core/models/business.models.ts`
- Create: `frontend/src/app/features/business-search/business-search.service.ts`
- Create: `frontend/src/app/features/business-search/business-search.service.spec.ts`
- Create: `frontend/src/app/features/business-search/business-search.ts`
- Create: `frontend/src/app/features/business-search/business-search.html`
- Create: `frontend/src/app/features/business-search/business-search.css`
- Create: `frontend/src/app/features/business-search/business-search.spec.ts`

**Interfaces:**
- Produces (models): `BusinessSearchResult { id, placeId, name, address, phone: string | null }`, `BusinessSearchResponse { searchId, results: BusinessSearchResult[] }`, `BusinessSearchSummary { id, query, location: string | null, createdAt, resultCount }`, `BusinessSearchDetail { id, query, location: string | null, createdAt, results: BusinessSearchResult[] }` — field names verified against `backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`. `BusinessSearchSummary`/`BusinessSearchDetail` are consumed by Task 7.
- Produces: `BusinessSearchService` (`@Service()`) with `results: Signal<BusinessSearchResult[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `search(query: string, location: string | null): Promise<void>`.
- Produces: `BusinessSearch` component, routed at `/search` by Task 9. Modified again in Task 8 to add a "Generate website" action per result.

- [ ] **Step 1: Write the business models**

```typescript
// frontend/src/app/core/models/business.models.ts
export interface BusinessSearchResult {
  id: string;
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
}

export interface BusinessSearchResponse {
  searchId: string;
  results: BusinessSearchResult[];
}

export interface BusinessSearchSummary {
  id: string;
  query: string;
  location: string | null;
  createdAt: string;
  resultCount: number;
}

export interface BusinessSearchDetail {
  id: string;
  query: string;
  location: string | null;
  createdAt: string;
  results: BusinessSearchResult[];
}
```

- [ ] **Step 2: Write the failing tests for `BusinessSearchService`**

```typescript
// frontend/src/app/features/business-search/business-search.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessSearchService } from './business-search.service';

describe('BusinessSearchService', () => {
  let service: BusinessSearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BusinessSearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('populates results on a successful search', async () => {
    const searchPromise = service.search('plumbers', 'Madrid');

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/businesses/search' &&
        r.params.get('query') === 'plumbers' &&
        r.params.get('location') === 'Madrid',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      searchId: 's1',
      results: [{ id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null }],
    });

    await searchPromise;

    expect(service.results()).toEqual([
      { id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null },
    ]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('omits the location param when none is given', async () => {
    const searchPromise = service.search('plumbers', null);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.has('location')).toBe(false);
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('sets errorMessage and clears results on failure', async () => {
    const searchPromise = service.search('plumbers', null);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    req.flush({ message: 'Query is required.' }, { status: 400, statusText: 'Bad Request' });

    await searchPromise;

    expect(service.errorMessage()).toBe('Query is required.');
    expect(service.results()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './business-search.service'`.

- [ ] **Step 4: Implement `BusinessSearchService`**

```typescript
// frontend/src/app/features/business-search/business-search.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BusinessSearchResponse, BusinessSearchResult } from '../../core/models/business.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class BusinessSearchService {
  private readonly http = inject(HttpClient);

  readonly results = signal<BusinessSearchResult[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async search(query: string, location: string | null): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let params = new HttpParams().set('query', query);
    if (location) {
      params = params.set('location', location);
    }

    try {
      const response = await firstValueFrom(
        this.http.get<BusinessSearchResponse>('/api/businesses/search', { params }),
      );
      this.results.set(response.results);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
      this.results.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

- [ ] **Step 5: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 6: Write the failing tests for `BusinessSearch`**

```typescript
// frontend/src/app/features/business-search/business-search.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BusinessSearch } from './business-search';
import { BusinessSearchService } from './business-search.service';
import { BusinessSearchResult } from '../../core/models/business.models';

describe('BusinessSearch', () => {
  let component: BusinessSearch;
  let searchServiceStub: {
    results: ReturnType<typeof signal<BusinessSearchResult[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    search: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    searchServiceStub = {
      results: signal<BusinessSearchResult[]>([]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      search: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: BusinessSearchService, useValue: searchServiceStub }],
    });

    component = TestBed.createComponent(BusinessSearch).componentInstance;
  });

  it('does not call search when the query is blank', () => {
    component.query.set('   ');
    component.onSubmit();
    expect(searchServiceStub.search).not.toHaveBeenCalled();
  });

  it('calls search with a trimmed query and null location when location is blank', () => {
    component.query.set('  plumbers  ');
    component.location.set('   ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', null);
  });

  it('calls search with the trimmed location when one is given', () => {
    component.query.set('plumbers');
    component.location.set(' Madrid ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', 'Madrid');
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

```bash
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './business-search'`.

- [ ] **Step 8: Implement `BusinessSearch`**

```typescript
// frontend/src/app/features/business-search/business-search.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessSearchService } from './business-search.service';

@Component({
  selector: 'app-business-search',
  imports: [FormsModule],
  templateUrl: './business-search.html',
  styleUrl: './business-search.css',
})
export class BusinessSearch {
  protected readonly searchService = inject(BusinessSearchService);

  readonly query = signal('');
  readonly location = signal('');

  readonly results = this.searchService.results;
  readonly isLoading = this.searchService.isLoading;
  readonly errorMessage = this.searchService.errorMessage;

  onSubmit(): void {
    const trimmedQuery = this.query().trim();
    if (!trimmedQuery) {
      return;
    }
    const trimmedLocation = this.location().trim();
    void this.searchService.search(trimmedQuery, trimmedLocation || null);
  }
}
```

- [ ] **Step 9: Write the template**

```html
<!-- frontend/src/app/features/business-search/business-search.html -->
<div class="mx-auto max-w-3xl p-6">
  <h1 class="mb-4 text-xl font-semibold">Search for businesses without a website</h1>

  <form (ngSubmit)="onSubmit()" class="mb-6 flex flex-wrap gap-3">
    <input
      [ngModel]="query()"
      (ngModelChange)="query.set($event)"
      name="query"
      type="text"
      placeholder="e.g. plumbers"
      class="flex-1 rounded border border-slate-300 px-3 py-2"
    />
    <input
      [ngModel]="location()"
      (ngModelChange)="location.set($event)"
      name="location"
      type="text"
      placeholder="Location (optional)"
      class="flex-1 rounded border border-slate-300 px-3 py-2"
    />
    <button
      type="submit"
      [disabled]="isLoading()"
      class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
    >
      {{ isLoading() ? 'Searching…' : 'Search' }}
    </button>
  </form>

  @if (errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
  }

  @if (results().length > 0) {
    <ul class="flex flex-col gap-3">
      @for (result of results(); track result.id) {
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ result.name }}</p>
          <p class="text-sm text-slate-600">{{ result.address }}</p>
          @if (result.phone) {
            <p class="text-sm text-slate-600">{{ result.phone }}</p>
          }
        </li>
      }
    </ul>
  } @else if (!isLoading()) {
    <p class="text-sm text-slate-500">No results yet — run a search above.</p>
  }
</div>
```

- [ ] **Step 10: Run tests to confirm they pass**

```bash
npx ng test --watch=false
```

Expected: PASS — all `BusinessSearchService` and `BusinessSearch` tests green.

- [ ] **Step 11: Commit**

```bash
cd ..
git add frontend/src/app/core/models/business.models.ts frontend/src/app/features/business-search
git commit -m "feat(frontend): add business search models, service, and component"
```

---

### Task 7: `SearchHistoryService` + `SearchHistory` component

**Files:**
- Create: `frontend/src/app/features/search-history/search-history.service.ts`
- Create: `frontend/src/app/features/search-history/search-history.service.spec.ts`
- Create: `frontend/src/app/features/search-history/search-history.ts`
- Create: `frontend/src/app/features/search-history/search-history.html`
- Create: `frontend/src/app/features/search-history/search-history.css`
- Create: `frontend/src/app/features/search-history/search-history.spec.ts`

**Interfaces:**
- Consumes: `BusinessSearchSummary`, `BusinessSearchDetail` (Task 6).
- Produces: `SearchHistoryService` (`@Service()`) with `searches: Signal<BusinessSearchSummary[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `loadSearches(): Promise<void>`, `getSearchDetail(id: string): Promise<BusinessSearchDetail>`.
- Produces: `SearchHistory` component, routed at `/history` by Task 9.

- [ ] **Step 1: Write the failing tests for `SearchHistoryService`**

```typescript
// frontend/src/app/features/search-history/search-history.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchHistoryService } from './search-history.service';

describe('SearchHistoryService', () => {
  let service: SearchHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and stores the list of past searches', async () => {
    const loadPromise = service.loadSearches();

    const req = httpMock.expectOne('/api/businesses/searches');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 's1', query: 'plumbers', location: 'Madrid', createdAt: '2026-01-01T00:00:00Z', resultCount: 3 },
    ]);

    await loadPromise;

    expect(service.searches().length).toBe(1);
    expect(service.searches()[0].query).toBe('plumbers');
    expect(service.isLoading()).toBe(false);
  });

  it('sets errorMessage on a failed load', async () => {
    const loadPromise = service.loadSearches();

    const req = httpMock.expectOne('/api/businesses/searches');
    req.flush({ title: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

    await loadPromise;

    expect(service.errorMessage()).toBe('Server error');
  });

  it('fetches a single search detail by id', async () => {
    const detailPromise = service.getSearchDetail('s1');

    const req = httpMock.expectOne('/api/businesses/searches/s1');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 's1',
      query: 'plumbers',
      location: 'Madrid',
      createdAt: '2026-01-01T00:00:00Z',
      results: [],
    });

    const detail = await detailPromise;

    expect(detail.id).toBe('s1');
    expect(detail.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './search-history.service'`.

- [ ] **Step 3: Implement `SearchHistoryService`**

```typescript
// frontend/src/app/features/search-history/search-history.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BusinessSearchDetail, BusinessSearchSummary } from '../../core/models/business.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class SearchHistoryService {
  private readonly http = inject(HttpClient);

  readonly searches = signal<BusinessSearchSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async loadSearches(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const searches = await firstValueFrom(
        this.http.get<BusinessSearchSummary[]>('/api/businesses/searches'),
      );
      this.searches.set(searches);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  getSearchDetail(id: string): Promise<BusinessSearchDetail> {
    return firstValueFrom(this.http.get<BusinessSearchDetail>(`/api/businesses/searches/${id}`));
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Write the failing tests for `SearchHistory`**

```typescript
// frontend/src/app/features/search-history/search-history.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SearchHistory } from './search-history';
import { SearchHistoryService } from './search-history.service';
import { BusinessSearchDetail, BusinessSearchSummary } from '../../core/models/business.models';

describe('SearchHistory', () => {
  let component: SearchHistory;
  let historyServiceStub: {
    searches: ReturnType<typeof signal<BusinessSearchSummary[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    loadSearches: ReturnType<typeof vi.fn>;
    getSearchDetail: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    historyServiceStub = {
      searches: signal<BusinessSearchSummary[]>([]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      loadSearches: vi.fn().mockResolvedValue(undefined),
      getSearchDetail: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SearchHistoryService, useValue: historyServiceStub }],
    });

    component = TestBed.createComponent(SearchHistory).componentInstance;
  });

  it('loads the search history on init', () => {
    component.ngOnInit();
    expect(historyServiceStub.loadSearches).toHaveBeenCalled();
  });

  it('viewDetail sets selectedDetail on success', async () => {
    const detail: BusinessSearchDetail = {
      id: 's1',
      query: 'plumbers',
      location: null,
      createdAt: '2026-01-01T00:00:00Z',
      results: [],
    };
    historyServiceStub.getSearchDetail.mockResolvedValue(detail);

    await component.viewDetail('s1');

    expect(component.selectedDetail()).toEqual(detail);
    expect(component.detailError()).toBeNull();
  });

  it('viewDetail sets detailError on failure', async () => {
    historyServiceStub.getSearchDetail.mockRejectedValue(new Error('network error'));

    await component.viewDetail('s1');

    expect(component.detailError()).toBe('Could not load this search.');
    expect(component.selectedDetail()).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

```bash
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './search-history'`.

- [ ] **Step 7: Implement `SearchHistory`**

```typescript
// frontend/src/app/features/search-history/search-history.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SearchHistoryService } from './search-history.service';
import { BusinessSearchDetail } from '../../core/models/business.models';

@Component({
  selector: 'app-search-history',
  imports: [DatePipe],
  templateUrl: './search-history.html',
  styleUrl: './search-history.css',
})
export class SearchHistory implements OnInit {
  private readonly historyService = inject(SearchHistoryService);

  readonly searches = this.historyService.searches;
  readonly isLoading = this.historyService.isLoading;
  readonly errorMessage = this.historyService.errorMessage;

  readonly selectedDetail = signal<BusinessSearchDetail | null>(null);
  readonly detailError = signal<string | null>(null);

  ngOnInit(): void {
    void this.historyService.loadSearches();
  }

  async viewDetail(id: string): Promise<void> {
    this.detailError.set(null);
    try {
      const detail = await this.historyService.getSearchDetail(id);
      this.selectedDetail.set(detail);
    } catch {
      this.detailError.set('Could not load this search.');
      this.selectedDetail.set(null);
    }
  }
}
```

- [ ] **Step 8: Write the template**

```html
<!-- frontend/src/app/features/search-history/search-history.html -->
<div class="mx-auto max-w-3xl p-6">
  <h1 class="mb-4 text-xl font-semibold">Past searches</h1>

  @if (errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
  }

  @if (isLoading()) {
    <p class="text-sm text-slate-500">Loading…</p>
  } @else if (searches().length === 0) {
    <p class="text-sm text-slate-500">No searches yet.</p>
  } @else {
    <ul class="flex flex-col gap-3">
      @for (search of searches(); track search.id) {
        <li class="rounded border border-slate-200 p-4">
          <button
            type="button"
            class="text-left font-medium underline-offset-2 hover:underline"
            (click)="viewDetail(search.id)"
          >
            {{ search.query }}@if (search.location) {, {{ search.location }}}
          </button>
          <p class="text-sm text-slate-600">
            {{ search.resultCount }} result(s) — {{ search.createdAt | date: 'medium' }}
          </p>
        </li>
      }
    </ul>
  }

  @if (detailError()) {
    <p class="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ detailError() }}</p>
  }

  @if (selectedDetail(); as detail) {
    <div class="mt-6 rounded border border-slate-200 p-4">
      <h2 class="mb-2 font-medium">{{ detail.query }}</h2>
      <ul class="flex flex-col gap-2">
        @for (result of detail.results; track result.id) {
          <li class="text-sm text-slate-600">{{ result.name }} — {{ result.address }}</li>
        }
      </ul>
    </div>
  }
</div>
```

- [ ] **Step 9: Run tests to confirm they pass**

```bash
npx ng test --watch=false
```

Expected: PASS — all `SearchHistoryService` and `SearchHistory` tests green.

- [ ] **Step 10: Commit**

```bash
cd ..
git add frontend/src/app/features/search-history
git commit -m "feat(frontend): add search history service and component"
```

---

### Task 8: `GeneratedWebsitesService` + `GeneratedWebsites` component + wire "Generate" into `BusinessSearch`

**Files:**
- Create: `frontend/src/app/core/models/website.models.ts`
- Create: `frontend/src/app/features/generated-websites/generated-websites.service.ts`
- Create: `frontend/src/app/features/generated-websites/generated-websites.service.spec.ts`
- Create: `frontend/src/app/features/generated-websites/generated-websites.ts`
- Create: `frontend/src/app/features/generated-websites/generated-websites.html`
- Create: `frontend/src/app/features/generated-websites/generated-websites.css`
- Create: `frontend/src/app/features/generated-websites/generated-websites.spec.ts`
- Modify: `frontend/src/app/features/business-search/business-search.ts`
- Modify: `frontend/src/app/features/business-search/business-search.html`
- Modify: `frontend/src/app/features/business-search/business-search.spec.ts`

**Interfaces:**
- Produces (models): `GenerateWebsiteRequest { businessSearchResultId: string }`, `GeneratedWebsite { id, businessName, businessAddress, businessPhone: string | null, generatedContent, createdAt }` — verified against `backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs`.
- Produces: `GeneratedWebsitesService` (`@Service()`) with `websites: Signal<GeneratedWebsite[]>`, `isLoading`, `errorMessage`, `isGenerating: Signal<boolean>`, `loadWebsites(): Promise<void>`, `generate(businessSearchResultId: string): Promise<void>`.
- Produces: `GeneratedWebsites` component, routed at `/websites` by Task 9.
- Consumes (in the `BusinessSearch` modification): `GeneratedWebsitesService.generate`, `.isGenerating`, `.errorMessage`.

- [ ] **Step 1: Write the website models**

```typescript
// frontend/src/app/core/models/website.models.ts
export interface GenerateWebsiteRequest {
  businessSearchResultId: string;
}

export interface GeneratedWebsite {
  id: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string | null;
  generatedContent: string;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing tests for `GeneratedWebsitesService`**

```typescript
// frontend/src/app/features/generated-websites/generated-websites.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GeneratedWebsitesService } from './generated-websites.service';

describe('GeneratedWebsitesService', () => {
  let service: GeneratedWebsitesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GeneratedWebsitesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and stores the list of generated websites', async () => {
    const loadPromise = service.loadWebsites();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'w1',
        businessName: 'Acme Plumbing',
        businessAddress: '1 Main St',
        businessPhone: null,
        generatedContent: '<html></html>',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    await loadPromise;

    expect(service.websites().length).toBe(1);
    expect(service.isLoading()).toBe(false);
  });

  it('generate() prepends the new website to the list', async () => {
    const generatePromise = service.generate('r1');

    const req = httpMock.expectOne('/api/websites/generate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ businessSearchResultId: 'r1' });
    req.flush({
      id: 'w2',
      businessName: 'New Biz',
      businessAddress: '2 Side St',
      businessPhone: null,
      generatedContent: '<html></html>',
      createdAt: '2026-01-02T00:00:00Z',
    });

    await generatePromise;

    expect(service.websites()[0].id).toBe('w2');
    expect(service.isGenerating()).toBe(false);
  });

  it('generate() sets errorMessage and rethrows on failure', async () => {
    const generatePromise = service.generate('r1');

    const req = httpMock.expectOne('/api/websites/generate');
    req.flush({ title: 'Bad gateway' }, { status: 502, statusText: 'Bad Gateway' });

    await expect(generatePromise).rejects.toBeTruthy();
    expect(service.errorMessage()).toBe('Bad gateway');
    expect(service.isGenerating()).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './generated-websites.service'`.

- [ ] **Step 4: Implement `GeneratedWebsitesService`**

```typescript
// frontend/src/app/features/generated-websites/generated-websites.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeneratedWebsite } from '../../core/models/website.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class GeneratedWebsitesService {
  private readonly http = inject(HttpClient);

  readonly websites = signal<GeneratedWebsite[]>([]);
  readonly isLoading = signal(false);
  readonly isGenerating = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async loadWebsites(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const websites = await firstValueFrom(this.http.get<GeneratedWebsite[]>('/api/websites'));
      this.websites.set(websites);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async generate(businessSearchResultId: string): Promise<void> {
    this.isGenerating.set(true);
    this.errorMessage.set(null);
    try {
      const website = await firstValueFrom(
        this.http.post<GeneratedWebsite>('/api/websites/generate', { businessSearchResultId }),
      );
      this.websites.update((current) => [website, ...current]);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
      throw error;
    } finally {
      this.isGenerating.set(false);
    }
  }
}
```

- [ ] **Step 5: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 6: Write the failing tests for `GeneratedWebsites`**

```typescript
// frontend/src/app/features/generated-websites/generated-websites.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { GeneratedWebsites } from './generated-websites';
import { GeneratedWebsitesService } from './generated-websites.service';
import { GeneratedWebsite } from '../../core/models/website.models';

describe('GeneratedWebsites', () => {
  let component: GeneratedWebsites;
  let websitesServiceStub: {
    websites: ReturnType<typeof signal<GeneratedWebsite[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    isGenerating: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    loadWebsites: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
  };
  const sampleWebsite: GeneratedWebsite = {
    id: 'w1',
    businessName: 'Acme Plumbing',
    businessAddress: '1 Main St',
    businessPhone: null,
    generatedContent: '<html><body>Hi</body></html>',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    websitesServiceStub = {
      websites: signal<GeneratedWebsite[]>([sampleWebsite]),
      isLoading: signal(false),
      isGenerating: signal(false),
      errorMessage: signal<string | null>(null),
      loadWebsites: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: GeneratedWebsitesService, useValue: websitesServiceStub }],
    });

    component = TestBed.createComponent(GeneratedWebsites).componentInstance;
  });

  it('loads websites on init', () => {
    component.ngOnInit();
    expect(websitesServiceStub.loadWebsites).toHaveBeenCalled();
  });

  it('starts with no website being previewed', () => {
    expect(component.previewing()).toBeNull();
  });

  it('preview() sets the selected website', () => {
    component.preview(sampleWebsite);
    expect(component.previewing()).toEqual(sampleWebsite);
  });

  it('closePreview() clears the selected website', () => {
    component.preview(sampleWebsite);
    component.closePreview();
    expect(component.previewing()).toBeNull();
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

```bash
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './generated-websites'`.

- [ ] **Step 8: Implement `GeneratedWebsites`**

```typescript
// frontend/src/app/features/generated-websites/generated-websites.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { GeneratedWebsitesService } from './generated-websites.service';
import { GeneratedWebsite } from '../../core/models/website.models';

@Component({
  selector: 'app-generated-websites',
  imports: [DatePipe],
  templateUrl: './generated-websites.html',
  styleUrl: './generated-websites.css',
})
export class GeneratedWebsites implements OnInit {
  private readonly websitesService = inject(GeneratedWebsitesService);

  readonly websites = this.websitesService.websites;
  readonly isLoading = this.websitesService.isLoading;
  readonly errorMessage = this.websitesService.errorMessage;

  readonly previewing = signal<GeneratedWebsite | null>(null);

  ngOnInit(): void {
    void this.websitesService.loadWebsites();
  }

  preview(website: GeneratedWebsite): void {
    this.previewing.set(website);
  }

  closePreview(): void {
    this.previewing.set(null);
  }
}
```

- [ ] **Step 9: Write the template**

```html
<!-- frontend/src/app/features/generated-websites/generated-websites.html -->
<div class="mx-auto max-w-3xl p-6">
  <h1 class="mb-4 text-xl font-semibold">Generated websites</h1>

  @if (errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
  }

  @if (isLoading()) {
    <p class="text-sm text-slate-500">Loading…</p>
  } @else if (websites().length === 0) {
    <p class="text-sm text-slate-500">No generated websites yet.</p>
  } @else {
    <ul class="flex flex-col gap-3">
      @for (website of websites(); track website.id) {
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ website.businessName }}</p>
          <p class="text-sm text-slate-600">{{ website.businessAddress }}</p>
          <p class="text-xs text-slate-400">{{ website.createdAt | date: 'medium' }}</p>
          <button
            type="button"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white"
            (click)="preview(website)"
          >
            Preview
          </button>
        </li>
      }
    </ul>
  }

  @if (previewing(); as website) {
    <div class="fixed inset-0 flex items-center justify-center bg-black/50 p-6">
      <div class="flex h-full max-h-[90vh] w-full max-w-3xl flex-col rounded bg-white p-4">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-medium">{{ website.businessName }}</h2>
          <button type="button" class="text-sm text-slate-600 underline" (click)="closePreview()">
            Close
          </button>
        </div>
        <iframe [srcdoc]="website.generatedContent" sandbox class="w-full flex-1 rounded border"></iframe>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 10: Run tests to confirm they pass**

```bash
npx ng test --watch=false
```

Expected: PASS — all `GeneratedWebsitesService` and `GeneratedWebsites` tests green.

- [ ] **Step 11: Write the failing test for the `BusinessSearch` "Generate" wiring**

Add to `frontend/src/app/features/business-search/business-search.spec.ts` (append inside the existing `describe('BusinessSearch', ...)` block, after the existing tests — keep the existing `beforeEach` and prior tests as they are):

```typescript
  it('calls GeneratedWebsitesService.generate with the result id', () => {
    component.onGenerate({ id: 'r1', placeId: 'p1', name: 'Acme', address: '1 Main St', phone: null });
    expect(websitesServiceStub.generate).toHaveBeenCalledWith('r1');
  });

  it('tracks which result is currently generating', async () => {
    let resolveGenerate!: () => void;
    websitesServiceStub.generate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    const result = { id: 'r1', placeId: 'p1', name: 'Acme', address: '1 Main St', phone: null };

    const generatePromise = component.onGenerate(result);
    expect(component.generatingResultId()).toBe('r1');

    resolveGenerate();
    await generatePromise;

    expect(component.generatingResultId()).toBeNull();
  });
```

Also add the new stub and its provider to the existing `beforeEach` in the same file — replace:

```typescript
    TestBed.configureTestingModule({
      providers: [{ provide: BusinessSearchService, useValue: searchServiceStub }],
    });
```

with:

```typescript
    websitesServiceStub = { generate: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        { provide: BusinessSearchService, useValue: searchServiceStub },
        { provide: GeneratedWebsitesService, useValue: websitesServiceStub },
      ],
    });
```

And add the corresponding `let` declaration and imports at the top of the file — replace:

```typescript
import { BusinessSearch } from './business-search';
import { BusinessSearchService } from './business-search.service';
import { BusinessSearchResult } from '../../core/models/business.models';

describe('BusinessSearch', () => {
  let component: BusinessSearch;
  let searchServiceStub: {
```

with:

```typescript
import { BusinessSearch } from './business-search';
import { BusinessSearchService } from './business-search.service';
import { GeneratedWebsitesService } from '../generated-websites/generated-websites.service';
import { BusinessSearchResult } from '../../core/models/business.models';

describe('BusinessSearch', () => {
  let component: BusinessSearch;
  let websitesServiceStub: { generate: ReturnType<typeof vi.fn> };
  let searchServiceStub: {
```

- [ ] **Step 12: Run it to confirm the new tests fail**

```bash
npx ng test --watch=false
```

Expected: FAIL — `component.onGenerate is not a function`.

- [ ] **Step 13: Modify `BusinessSearch` to add the "Generate" action**

In `frontend/src/app/features/business-search/business-search.ts`, replace the whole file with:

```typescript
// frontend/src/app/features/business-search/business-search.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessSearchService } from './business-search.service';
import { GeneratedWebsitesService } from '../generated-websites/generated-websites.service';
import { BusinessSearchResult } from '../../core/models/business.models';

@Component({
  selector: 'app-business-search',
  imports: [FormsModule],
  templateUrl: './business-search.html',
  styleUrl: './business-search.css',
})
export class BusinessSearch {
  protected readonly searchService = inject(BusinessSearchService);
  private readonly websitesService = inject(GeneratedWebsitesService);

  readonly query = signal('');
  readonly location = signal('');

  readonly results = this.searchService.results;
  readonly isLoading = this.searchService.isLoading;
  readonly errorMessage = this.searchService.errorMessage;

  readonly generatingResultId = signal<string | null>(null);
  readonly generateError = this.websitesService.errorMessage;

  onSubmit(): void {
    const trimmedQuery = this.query().trim();
    if (!trimmedQuery) {
      return;
    }
    const trimmedLocation = this.location().trim();
    void this.searchService.search(trimmedQuery, trimmedLocation || null);
  }

  async onGenerate(result: BusinessSearchResult): Promise<void> {
    this.generatingResultId.set(result.id);
    try {
      await this.websitesService.generate(result.id);
    } catch {
      // errorMessage is already set on the service; nothing further to do here.
    } finally {
      this.generatingResultId.set(null);
    }
  }
}
```

- [ ] **Step 14: Add the "Generate website" button to the template**

In `frontend/src/app/features/business-search/business-search.html`, replace the results `<li>` block:

```html
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ result.name }}</p>
          <p class="text-sm text-slate-600">{{ result.address }}</p>
          @if (result.phone) {
            <p class="text-sm text-slate-600">{{ result.phone }}</p>
          }
        </li>
```

with:

```html
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ result.name }}</p>
          <p class="text-sm text-slate-600">{{ result.address }}</p>
          @if (result.phone) {
            <p class="text-sm text-slate-600">{{ result.phone }}</p>
          }
          <button
            type="button"
            [disabled]="generatingResultId() === result.id"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            (click)="onGenerate(result)"
          >
            {{ generatingResultId() === result.id ? 'Generating…' : 'Generate website' }}
          </button>
        </li>
```

And add, just above the closing `</div>` of the outer wrapper, so generation errors are visible:

```html
  @if (generateError()) {
    <p class="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ generateError() }}</p>
  }
```

- [ ] **Step 15: Run all tests to confirm they pass**

```bash
npx ng test --watch=false
```

Expected: PASS — every test file, including the updated `business-search.spec.ts`.

- [ ] **Step 16: Commit**

```bash
cd ..
git add frontend/src/app/core/models/website.models.ts frontend/src/app/features/generated-websites frontend/src/app/features/business-search
git commit -m "feat(frontend): add generated websites service/component, wire generate action into search"
```

---

### Task 9: Shared layout, not-found page, routing, and app bootstrap

**Files:**
- Create: `frontend/src/app/shared/layout/layout.ts`
- Create: `frontend/src/app/shared/layout/layout.html`
- Create: `frontend/src/app/shared/layout/layout.css`
- Create: `frontend/src/app/shared/layout/layout.spec.ts`
- Create: `frontend/src/app/shared/not-found/not-found.ts`
- Create: `frontend/src/app/shared/not-found/not-found.html`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/app.ts`
- Modify: `frontend/src/app/app.html`
- Modify: `frontend/src/app/app.spec.ts`

**Interfaces:**
- Consumes: `AuthService.logout()` (Task 2), `authInterceptor` (Task 3), `authGuard` (Task 4), `Login` (Task 5), `BusinessSearch` (Task 6/8), `SearchHistory` (Task 7), `GeneratedWebsites` (Task 8).
- Produces: the fully wired app — `/login` public, `/search` `/history` `/websites` behind `Layout` + `authGuard`, `/**` → `NotFound`.

- [ ] **Step 1: Write the failing test for `Layout`**

```typescript
// frontend/src/app/shared/layout/layout.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Layout } from './layout';
import { AuthService } from '../../core/auth.service';

describe('Layout', () => {
  let component: Layout;
  let authServiceStub: { logout: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { logout: vi.fn() };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
    });

    component = TestBed.createComponent(Layout).componentInstance;
  });

  it('logout() delegates to AuthService.logout()', () => {
    component.logout();
    expect(authServiceStub.logout).toHaveBeenCalled();
  });
});
```

`provideRouter([])` is required because `Layout`'s template uses `routerLink`, which needs an injected `Router` even in a unit test that never navigates.

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend
npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 3: Implement `Layout`**

```typescript
// frontend/src/app/shared/layout/layout.ts
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  private readonly authService = inject(AuthService);

  logout(): void {
    this.authService.logout();
  }
}
```

- [ ] **Step 4: Write the template**

```html
<!-- frontend/src/app/shared/layout/layout.html -->
<div class="min-h-screen bg-slate-50">
  <nav class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
    <div class="flex gap-4 text-sm font-medium">
      <a routerLink="/search" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Search
      </a>
      <a routerLink="/history" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        History
      </a>
      <a routerLink="/websites" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Websites
      </a>
    </div>
    <button type="button" class="text-sm text-slate-500 hover:text-slate-900" (click)="logout()">
      Log out
    </button>
  </nav>
  <router-outlet />
</div>
```

- [ ] **Step 5: Leave `layout.css` empty** (Tailwind utility classes only).

- [ ] **Step 6: Run it to confirm it passes**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 7: Write `NotFound`** (no test needed — it's a static template with no logic to verify beyond "it renders", which Step 9's full-app smoke test covers)

```typescript
// frontend/src/app/shared/not-found/not-found.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
})
export class NotFound {}
```

```html
<!-- frontend/src/app/shared/not-found/not-found.html -->
<div class="flex min-h-screen flex-col items-center justify-center gap-4">
  <h1 class="text-2xl font-semibold">Page not found</h1>
  <a routerLink="/search" class="text-sm text-slate-600 underline">Back to search</a>
</div>
```

- [ ] **Step 8: Wire the routes**

Replace `frontend/src/app/app.routes.ts` with:

```typescript
// frontend/src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';
import { Login } from './features/login/login';
import { BusinessSearch } from './features/business-search/business-search';
import { SearchHistory } from './features/search-history/search-history';
import { GeneratedWebsites } from './features/generated-websites/generated-websites';
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
      { path: '', pathMatch: 'full', redirectTo: 'search' },
    ],
  },
  { path: '**', component: NotFound },
];
```

- [ ] **Step 9: Register `HttpClient` and the interceptor**

Replace `frontend/src/app/app.config.ts` with:

```typescript
// frontend/src/app/app.config.ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

- [ ] **Step 10: Reduce the root component to a plain router outlet**

Replace `frontend/src/app/app.ts` with:

```typescript
// frontend/src/app/app.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
```

Replace `frontend/src/app/app.html` with:

```html
<!-- frontend/src/app/app.html -->
<router-outlet />
```

- [ ] **Step 11: Update the root component's test to match**

Replace `frontend/src/app/app.spec.ts` with:

```typescript
// frontend/src/app/app.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
```

(The CLI-generated `app.css` file can stay as an empty/near-empty file — no changes needed there.)

- [ ] **Step 12: Run the full test suite**

```bash
npx ng test --watch=false
```

Expected: PASS — every spec file in the project, including `App`, `Layout`, and all core/feature tests from Tasks 2–8.

- [ ] **Step 13: Run a full production build**

```bash
npx ng build
```

Expected: `Application bundle generation complete.` with no errors. If any component/service/model has a type error surfaced only at build time (not caught by the unit tests), fix it here before continuing.

- [ ] **Step 14: Manual smoke test against the real backend**

This step can't be scripted — it needs a running Postgres and the real backend, which are outside this plan's scope (the Deployment/Integration plan handles environment setup). Document it as the acceptance check for whoever runs this app end-to-end for the first time:

1. Start Postgres and the backend: `cd backend/LocaleBoost.Api && dotnet run` (uses the `http` launch profile, `http://localhost:5091`, per `Properties/launchSettings.json`).
2. Insert an invite code directly into the database (per the design spec — no admin UI exists): `INSERT INTO "InviteCodes" ("Id", "Code", "IsUsed", "CreatedAt") VALUES (gen_random_uuid(), 'TESTCODE', false, now());`
3. In another terminal: `cd frontend && npm start` (runs `ng serve --proxy-config proxy.conf.json`).
4. Open `http://localhost:4200`. Confirm: redirected to `/login` (not authenticated). Register with `TESTCODE` → redirected to `/search`. Run a search → results appear (or a controlled error if Google Maps isn't configured — that's expected without real API keys, not a frontend bug). Click "Generate website" on a result → either a generated preview appears in `/websites` or a controlled error shows (same caveat for the Claude API key). Visit `/history` → the search just run appears; clicking it shows its detail. Log out → redirected to `/login`, and `/search` now redirects back to `/login` when visited directly.

- [ ] **Step 15: Commit**

```bash
cd ..
git add frontend/src/app
git commit -m "feat(frontend): wire routing, layout, not-found, and app bootstrap"
```

---

## Out of scope (deferred, per both specs)

- Serving the Angular build from the .NET backend (`MapFallbackToFile`), Railway configuration, real (non-placeholder) API keys, seeding the first real invite code for production use — all belong to the separate, not-yet-written Deployment/Integration plan.
- A global toast/notification system — errors surface inline per-component instead.
- E2E tests (Playwright/Cypress) — deferred per the original spec.
- Per-user rate limiting UI/UX — the backend doesn't implement it either (deferred there too).
