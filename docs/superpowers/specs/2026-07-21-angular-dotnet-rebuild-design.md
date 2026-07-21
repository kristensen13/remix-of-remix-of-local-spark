# Rebuild: Angular + .NET replacement for LocaleBoost Pro

## Context

The existing app (`buscador-clientes-web`, React/Vite + Supabase, deployed on Vercel) was inherited from a previous developer, not built by this project's owner. Its Supabase backend project was deleted (confirmed via NXDOMAIN on its subdomain) and most of its credentials (Supabase keys, Google Maps API key, Lovable AI key) are unrecoverable. Rather than recreate the same stack, we are rebuilding on a stack the owner actually knows: Angular + .NET.

This spec covers the first version: replicate the four things the old app did, on the new stack, with one deliberate behavior change (invite-only registration instead of open registration).

## Goals (v1 scope)

1. Login / registration, gated by invite code (no open signup)
2. Search for local businesses without a website (Google Maps Platform)
3. Generate an AI landing page for a chosen business (Claude/Anthropic API)
4. List of the user's past searches and past generated websites (both persisted)

Explicitly out of scope for v1 (deferred, not forgotten):
- Per-user rate limiting on search/generation calls (flagged as a fast-follow if quota abuse or cost becomes a concern)
- An admin UI for managing invite codes (codes are inserted directly into the database via SQL)
- End-to-end test suite (Playwright/Cypress)

## Architecture

A single ASP.NET Core (.NET 8+) project serves both the API and the frontend:

- REST API under `/api/*` via controllers.
- The Angular production build (`ng build` output) is served as static files from the same app, with `MapFallbackToFile("index.html")` so Angular's client-side router handles all non-API routes.
- Persistence via PostgreSQL, accessed through EF Core + Npgsql.
- All external API calls (Google Maps Platform, Anthropic Claude) are made server-side only — API keys live in backend configuration (Railway environment variables), never shipped to the browser. This is a deliberate improvement over the old app, where the Supabase anon key was necessarily client-visible.
- Deployed as a single Railway service (API + static frontend together) plus a managed Postgres plugin in the same Railway project. Chosen over a two-service split (separate static frontend + API) because it avoids CORS configuration and a second deploy pipeline, at the cost of not being able to scale or deploy the frontend and backend independently — an acceptable trade-off at this project's size.

```
[Angular SPA (served as static files)] <-> [ASP.NET Core API] <-> [PostgreSQL]
                                                  |
                                    [Google Maps API]   [Claude API]
```

## Components

**Angular (standalone components, no NgModules)**
- `LoginComponent` — login/register tabs; register now requires an invite code field
- `AuthGuard` (functional route guard) — protects routes that require a session
- `AuthInterceptor` — attaches the JWT as a `Bearer` token to outgoing requests; on 401, redirects to `/login`
- `AuthService` — login, register, logout, token storage
- `BusinessSearchComponent` + `BusinessSearchService` — search form and results
- `SearchHistoryComponent` — list of past searches (new, replaces the implicit "search happens, then forget" behavior of the old app)
- `GeneratedWebsitesComponent` + `GeneratedWebsitesService` — list of generated websites
- `NotFoundComponent` — catch-all route

**Backend (.NET)** — deliberately flat, no repository/CQRS layer on top of EF Core; three controllers doesn't justify the extra indirection.
- `Program.cs` — wires up EF Core, ASP.NET Identity, JWT bearer auth, static file fallback
- `AppDbContext : IdentityDbContext` — `DbSet<InviteCode>`, `DbSet<BusinessSearch>`, `DbSet<BusinessSearchResult>`, `DbSet<GeneratedWebsite>`
- `AuthController` — `POST /api/auth/register`, `POST /api/auth/login`
- `BusinessesController` — `GET /api/businesses/search`, `GET /api/businesses/searches`, `GET /api/businesses/searches/{id}`
- `WebsitesController` — `POST /api/websites/generate`, `GET /api/websites`
- `GoogleMapsService` — typed HTTP client wrapping Google Places API calls
- `ClaudeService` — typed HTTP client wrapping the Anthropic Messages API

## Data model

**AspNetUsers** — standard ASP.NET Identity table, no extra fields needed for v1.

**InviteCode**
| Field | Type | Notes |
|---|---|---|
| Id | Guid | PK |
| Code | string | unique, entered at registration |
| IsUsed | bool | |
| UsedByUserId | Guid? | FK to AspNetUsers, null until used |
| CreatedAt | DateTime | |
| UsedAt | DateTime? | |

Codes are inserted directly into the database (SQL) by the project owner — no admin endpoint or UI in v1.

**BusinessSearch**
| Field | Type | Notes |
|---|---|---|
| Id | Guid | PK |
| UserId | Guid | FK to AspNetUsers |
| Query | string | search term |
| Location | string? | searched area |
| CreatedAt | DateTime | |

**BusinessSearchResult**
| Field | Type | Notes |
|---|---|---|
| Id | Guid | PK |
| BusinessSearchId | Guid | FK to BusinessSearch |
| PlaceId | string | Google Places id, kept for reference / future detail lookups |
| Name | string | |
| Address | string | |
| Phone | string? | |
| HasWebsite | bool | results are filtered to businesses without a website — the app's whole premise |

**GeneratedWebsite**
| Field | Type | Notes |
|---|---|---|
| Id | Guid | PK |
| UserId | Guid | FK to AspNetUsers, owner |
| BusinessName | string | |
| BusinessAddress | string | |
| BusinessPhone | string? | |
| GeneratedContent | text | HTML/content returned by Claude |
| CreatedAt | DateTime | |

## Key flows

**Registration**: `POST /api/auth/register { email, password, inviteCode }` → validate `inviteCode` exists and `IsUsed == false` → create the Identity user → mark the code used (`UsedByUserId`, `UsedAt`) → return a JWT. Invalid/already-used code → 400 with a specific message.

**Login**: `POST /api/auth/login { email, password }` → Identity validates credentials → return a JWT (expiry ~7 days) → Angular stores it; `AuthInterceptor` attaches it from then on.

**Business search**: `GET /api/businesses/search?query=...&location=...` (requires JWT) → `GoogleMapsService` calls the Places API, filtering for results without a `website` field → a `BusinessSearch` row plus its `BusinessSearchResult` rows are created in one transaction → results returned to the frontend. Every search is a live Google Maps call (no caching) — a real cost per search, worth revisiting if rate limiting gets added later.

**Website generation**: `POST /api/websites/generate { businessSearchResultId }` (requires JWT) → look up the business from `BusinessSearchResult` → `ClaudeService` generates HTML/content from a prompt built out of the business's name/address/phone → save as `GeneratedWebsite` linked to the user → return the generated content for preview.

**Listings**: `GET /api/businesses/searches` and `GET /api/websites` return, respectively, the authenticated user's search history and generated websites — both filtered by the `UserId` claim from the JWT.

## Error handling and authorization

- `[Authorize]` on every controller except `register`/`login`. The JWT carries the user's id as a claim; every query is scoped by that id, so a user can never see another user's data by construction — no separate per-resource permission checks needed.
- A global exception-handling middleware converts unhandled exceptions to `ProblemDetails` responses — full detail only in development, a generic message in production.
- Validation errors (bad/used invite code, missing fields) → 400 with a specific message.
- Missing/expired JWT → 401 (Angular's interceptor redirects to `/login` on this).
- Google Maps or Claude failures (timeout, upstream error) are caught inside their respective services and surfaced as a controlled error response ("couldn't complete the search/generation, try again") rather than a raw 500.

**Deferred**: per-user rate limiting on search/generation endpoints (ASP.NET Core's built-in rate limiting middleware would be the natural fit) — invite-only registration already cuts most of the abuse risk, but each call still costs real money, so this is flagged as a fast-follow rather than dropped.

## Testing strategy

**Backend**: unit tests for invite-code validation logic and for `GoogleMapsService`/`ClaudeService` against a mocked `HttpClient` (no real external calls in tests). Integration tests via `WebApplicationFactory` plus a real test Postgres (Testcontainers), covering each endpoint end to end: registration with valid/invalid codes, login, search (Google Maps mocked), generation (Claude mocked), and that listings only ever return the authenticated user's own data.

**Frontend**: unit tests with Jasmine/Karma (Angular's default) for `AuthService`, `AuthInterceptor`, `AuthGuard`, and the search/listing components, mocking HTTP calls.

Full e2e (Playwright/Cypress) is deferred — can be added later to cover the happy path (login → search → generate → view listing) if the project grows enough to justify it.

## Out of scope (deferred, tracked for later)

- Per-user rate limiting on search/generation (see Error handling section)
- Admin UI for invite codes
- E2E test suite
- Any new features beyond the four v1 goals — those come after this rebuild ships, in a follow-up design
