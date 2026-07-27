# Frontend: Angular app for the LocaleBoost rebuild

## Context

This spec extends `2026-07-21-angular-dotnet-rebuild-design.md`, which already defines the overall architecture, the Angular component list, the data model, and the API contract (now stable and implemented — see `docs/superpowers/plans/2026-07-21-backend-api.md`, merged to `main` at `af775f6`). That spec left the frontend's concrete implementation details (repo layout, styling, state pattern, folder structure) unspecified. This document fills those in so an implementation plan can be written.

Out of scope here (covered by the separate, not-yet-written Deployment/Integration plan): serving the Angular build from the .NET app, Railway configuration, environment variable wiring, seeding the first invite code.

## Repo layout

The repo root currently still holds the old React/Vite/Supabase app (inherited, not built by the project owner; its Supabase backend is gone — see prior session notes) alongside the new `backend/` folder. As part of this work:

- Create `frontend/` at the repo root, sibling to `backend/`.
- Remove the old app entirely: `src/`, `public/`, `supabase/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `eslint.config.js`, `tsconfig*.json`, `dist/`, the old `README.md`, `vercel.json`, `.vercel/`, and `node_modules/`.
- Review root `.env` / `.env.local` / `.env.example`: drop anything Supabase/Vite-specific. Per the original spec, all external API keys (Google Maps, Claude) live server-side only in `backend/` configuration — nothing frontend-related belongs in a browser-exposed env file.

## Tooling and stack

- Angular CLI, latest stable (Angular 19+), standalone components only — no NgModules, matching the original spec.
- **Styling**: Tailwind CSS utility classes, hand-built standalone components. No component library (no Angular Material, no port of the old Radix/shadcn components) — a new visual design, not a pixel-for-pixel port of the old app.
- **State**: Signals (`signal`/`computed`) in services for app state (search results, search history, generated websites, loading/error flags), read directly in templates. No RxJS `BehaviorSubject`/`async` pipe pattern, except where `HttpClient` itself returns Observables (converted to signals at the service boundary via `toSignal` or manual subscription into a signal).
- **HTTP**: `HttpClient` configured with `withInterceptors`, functional `AuthInterceptor` attaching the JWT as `Bearer <token>` and redirecting to `/login` on 401.
- **Routing**: functional `AuthGuard` (`CanActivateFn`).
- **Testing**: Jasmine/Karma (Angular CLI default), `HttpTestingController` for mocking HTTP calls. No e2e (deferred per the original spec).

## App structure

**Routes**:
| Path | Component | Guarded? |
|---|---|---|
| `/login` | `LoginComponent` | no |
| `/search` | `BusinessSearchComponent` | yes |
| `/history` | `SearchHistoryComponent` | yes |
| `/websites` | `GeneratedWebsitesComponent` | yes |
| `/**` | `NotFoundComponent` | no |

The three guarded routes are nested under a shared authenticated layout component (top nav: Search / History / Websites links + logout button). This layout isn't in the original spec but is needed for navigating between the three authenticated views; it's a single, simple component, not a new architectural layer.

**Folders** (under `frontend/src/app/`):
- `core/` — `AuthService`, `AuthGuard`, `AuthInterceptor`, HTTP request/response models mirroring the backend DTOs (`Dtos/Auth`, `Dtos/Businesses`, `Dtos/Websites` on the API side).
- `features/login/`, `features/business-search/`, `features/search-history/`, `features/generated-websites/` — one folder per feature, each with its component(s) and service.
- `shared/` — the authenticated layout component, `NotFoundComponent`.

This is a conventional Angular project split (core/features/shared), not something the original spec mandates — chosen for clarity given five distinct components plus shared auth concerns.

## Components

Unchanged from the original spec:
- `LoginComponent` — login/register tabs; register includes an invite code field.
- `AuthGuard` — functional route guard, protects `/search`, `/history`, `/websites`.
- `AuthInterceptor` — attaches JWT bearer token; redirects to `/login` on 401.
- `AuthService` — login, register, logout, token storage (browser storage — `localStorage`, read/written only by this service).
- `BusinessSearchComponent` + `BusinessSearchService` — search form (query, location) and results list, calling `GET /api/businesses/search`.
- `SearchHistoryComponent` — past searches, calling `GET /api/businesses/searches` and `GET /api/businesses/searches/{id}`.
- `GeneratedWebsitesComponent` + `GeneratedWebsitesService` — generated site list, calling `GET /api/websites` and `POST /api/websites/generate`.
- `NotFoundComponent` — catch-all route.

## Error handling

- `AuthInterceptor` catches 401 globally and redirects to `/login`, clearing any stored token.
- Each feature service surfaces backend error responses (400 validation errors, 502 upstream-failure messages per the backend's controlled error handling) to its component as a signal the template can render inline — no global toast/notification system for v1.

## Testing strategy

Unchanged from the original spec: Jasmine/Karma unit tests for `AuthService`, `AuthInterceptor`, `AuthGuard`, and the three feature components (`BusinessSearchComponent`, `SearchHistoryComponent`, `GeneratedWebsitesComponent`), mocking HTTP calls via `HttpTestingController`. Full e2e remains deferred.

## Out of scope (deferred)

- Serving the Angular build from the .NET app, Railway config, real API keys, first invite code seeding — Deployment/Integration plan.
- Global toast/notification system.
- Any UI beyond the four v1 goals already defined in the original spec.
