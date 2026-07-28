# Deployment/Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship LocaleBoost (Angular frontend + .NET 8 API + PostgreSQL) to Railway as a single deployed service, with real secrets, applied migrations, and a working invite code, so the app is reachable and usable in production.

**Architecture:** A multi-stage Dockerfile builds the Angular production bundle and the .NET 8 API into one runtime image; ASP.NET Core serves the API under `/api/*` and the Angular build as static files with SPA fallback routing, per `docs/superpowers/specs/2026-07-21-angular-dotnet-rebuild-design.md`. Railway hosts this as one service plus a managed Postgres plugin. EF Core migrations apply automatically on startup so no manual migration step is needed post-deploy.

**Tech Stack:** ASP.NET Core 8 (`Microsoft.AspNetCore.StaticFiles`), EF Core 8 + Npgsql, Angular 22 (`ng build`), Docker multi-stage build, Railway CLI v5.

## Global Constraints

- Backend API contract is frozen (see `docs/superpowers/plans/2026-07-21-backend-api.md`) — do not change controller routes/DTOs in this plan.
- Angular build output path is `frontend/dist/frontend/browser` (verified 2026-07-28 by running `ng build`; re-verify if this drifts).
- `Jwt:Key` must be at least 32 UTF-8 bytes in Production — `Program.cs` already throws on startup if it's the dev placeholder or too short (`backend/LocaleBoost.Api/Program.cs:64-79`). Do not weaken this check.
- No admin UI or endpoint for invite codes in v1 (explicit out-of-scope in the design spec) — the first invite code is inserted via raw SQL, not application code.
- Follow existing test conventions exactly: xUnit, `Testcontainers.PostgreSql`, `WebApplicationFactory<Program>` — see `backend/LocaleBoost.Api.Tests/IntegrationTests/CustomWebApplicationFactory.cs` and `HealthCheckTests.cs` for the established pattern.
- Tasks 5 and 6 create real, possibly billed, cloud resources (Railway project, Postgres plugin, deployment) and require real secrets (Google Maps API key, Anthropic API key) that only the user has. **Do not run any `railway` command that provisions or deploys, and do not fabricate/guess API keys, without the user present to confirm and supply them.**

---

## File Structure

- `backend/LocaleBoost.Api/Program.cs` — add static file serving + SPA fallback, add startup migration call.
- `backend/LocaleBoost.Api/wwwroot/.gitkeep` — new empty tracked placeholder; real Angular build output is copied here at Docker build time, never committed.
- `backend/LocaleBoost.Api.Tests/IntegrationTests/StaticFileFallbackTests.cs` — new test file for Task 1.
- `backend/LocaleBoost.Api.Tests/IntegrationTests/StartupMigrationTests.cs` — new test file for Task 2.
- `Dockerfile` (repo root) — new multi-stage build.
- `.dockerignore` (repo root) — new, keeps build context small.
- `.gitignore` (repo root) — add `backend/LocaleBoost.Api/wwwroot/*` (except `.gitkeep`).
- `railway.toml` (repo root) — new, tells Railway to use the Dockerfile builder.

---

### Task 1: Serve the Angular SPA from ASP.NET Core

**Files:**
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Create: `backend/LocaleBoost.Api/wwwroot/.gitkeep`
- Modify: `.gitignore`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/StaticFileFallbackTests.cs`

**Interfaces:**
- Consumes: `Program` (partial class, already exposed for `WebApplicationFactory<Program>` at `backend/LocaleBoost.Api/Program.cs:96`).
- Produces: static file + SPA fallback middleware wired into the existing pipeline, ordered so `/api/*` and `/health` still resolve to their controllers/minimal API and are never swallowed by the fallback.

- [ ] **Step 1: Create the tracked `wwwroot` placeholder**

```bash
mkdir -p backend/LocaleBoost.Api/wwwroot
touch backend/LocaleBoost.Api/wwwroot/.gitkeep
```

- [ ] **Step 2: Ignore real static build output, keep the placeholder**

Add to `.gitignore` (repo root), in the `.NET backend build output` section:

```
# Angular build output copied into wwwroot at Docker build time — never committed
backend/LocaleBoost.Api/wwwroot/*
!backend/LocaleBoost.Api/wwwroot/.gitkeep
```

- [ ] **Step 3: Write the failing test**

Create `backend/LocaleBoost.Api.Tests/IntegrationTests/StaticFileFallbackTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class StaticFileFallbackTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public StaticFileFallbackTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClientWithFakeWebRoot(string webRootPath)
    {
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseWebRoot(webRootPath);
        });

        return factory.CreateClient();
    }

    [Fact]
    public async Task UnknownNonApiRoute_FallsBackToIndexHtml()
    {
        var webRoot = Directory.CreateTempSubdirectory().FullName;
        var indexHtml = "<html><body>spa-shell</body></html>";
        await File.WriteAllTextAsync(Path.Combine(webRoot, "index.html"), indexHtml);

        var client = CreateClientWithFakeWebRoot(webRoot);

        var response = await client.GetAsync("/dashboard/some-deep-link");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(indexHtml, body);
    }

    [Fact]
    public async Task HealthEndpoint_IsNotShadowedByStaticFallback()
    {
        var webRoot = Directory.CreateTempSubdirectory().FullName;
        await File.WriteAllTextAsync(Path.Combine(webRoot, "index.html"), "<html></html>");

        var client = CreateClientWithFakeWebRoot(webRoot);

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.Equal("ok", json!.Status);
    }

    [Fact]
    public async Task UnknownApiRoute_Returns404NotIndexHtml()
    {
        var webRoot = Directory.CreateTempSubdirectory().FullName;
        await File.WriteAllTextAsync(Path.Combine(webRoot, "index.html"), "<html></html>");

        var client = CreateClientWithFakeWebRoot(webRoot);

        var response = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private record HealthResponse(string Status);
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && dotnet test --filter StaticFileFallbackTests`
Expected: FAIL — `/dashboard/some-deep-link` returns 404 (no fallback wired yet), `/api/does-not-exist` also 404 (already passes, that's fine), `HealthEndpoint_IsNotShadowedByStaticFallback` passes already (no regression to guard against yet, but keep the test — it's the guard for Step 5).

- [ ] **Step 5: Wire up static files + SPA fallback in `Program.cs`**

In `backend/LocaleBoost.Api/Program.cs`, after the `app.UseAuthorization();` line (`Program.cs:88`) and before `app.MapGet("/health", ...)` (`Program.cs:90`), add:

```csharp
app.UseDefaultFiles();
app.UseStaticFiles();
```

And after `app.MapControllers();` (`Program.cs:92`), add:

```csharp
app.MapFallbackToFile("index.html");
```

Full relevant section should now read:

```csharp
app.UseAuthentication();
app.UseAuthorization();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
```

`MapFallbackToFile` only activates for requests that don't match any earlier endpoint (controllers, minimal APIs, or an existing static file), so `/api/*` 404s stay 404s — they're handled by `MapControllers`' routing failing, not by the fallback — while `/api/does-not-exist` specifically stays a 404 because `MapFallbackToFile` by default only catches GET requests to paths without a file extension outside `/api` is **not** automatic; verify this with Step 6 and, if `UnknownApiRoute_Returns404NotIndexHtml` fails, scope the fallback with `app.MapFallbackToFile("{*path:nonfile}", "index.html")` restricted via `MapWhen`/pattern exclusion — but try the plain form first since ASP.NET Core's routing already prioritizes exact controller matches over the fallback.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && dotnet test --filter StaticFileFallbackTests`
Expected: PASS (all three). If `UnknownApiRoute_Returns404NotIndexHtml` fails because the fallback caught it, change the fallback mapping to:

```csharp
app.MapFallbackToFile("{*path:regex(^(?!api).*$)}", "index.html");
```

and rerun until green.

- [ ] **Step 7: Run the full backend test suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all existing tests (23+ from the backend plan, plus the 3 new ones) PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Program.cs backend/LocaleBoost.Api/wwwroot/.gitkeep .gitignore backend/LocaleBoost.Api.Tests/IntegrationTests/StaticFileFallbackTests.cs
git commit -m "feat(backend): serve Angular build as static files with SPA fallback"
```

---

### Task 2: Apply EF Core migrations automatically on startup

**Files:**
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/StartupMigrationTests.cs`

**Interfaces:**
- Consumes: `AppDbContext` (`backend/LocaleBoost.Api/Data/AppDbContext.cs`), `Program`.
- Produces: a guarantee that any environment pointed at a fresh, unmigrated Postgres database gets its schema created automatically the first time the app starts — no separate `dotnet ef database update` step required in the Railway deploy flow.

**Context:** `CustomWebApplicationFactory` (used by all existing integration tests) already calls `db.Database.MigrateAsync()` itself in `IAsyncLifetime.InitializeAsync()` (`backend/LocaleBoost.Api.Tests/IntegrationTests/CustomWebApplicationFactory.cs:32-39`) — that's test harness setup standing in for what `Program.cs` doesn't yet do at real runtime. This task closes that gap in `Program.cs` itself. The new test below deliberately does **not** reuse `CustomWebApplicationFactory`, so it can prove the migration happened because of `Program.cs`'s own code, not the test harness's.

- [ ] **Step 1: Write the failing test**

Create `backend/LocaleBoost.Api.Tests/IntegrationTests/StartupMigrationTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class StartupMigrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
    private WebApplicationFactory<Program> _factory = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
                if (descriptor is not null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<AppDbContext>(options =>
                    options.UseNpgsql(_postgres.GetConnectionString()));
            });
        });
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    [Fact]
    public async Task FreshUnmigratedDatabase_SchemaExistsAfterAppStartup_WithoutManualMigrateCall()
    {
        // No MigrateAsync() call anywhere in this test — if Program.cs doesn't migrate
        // on startup, this register call will fail because AspNetUsers/InviteCodes don't exist.
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "startup-migration-check@example.com",
            password = "Password1",
            inviteCode = "does-not-exist"
        });

        // 400 (invalid invite code) proves the schema exists and the query ran cleanly —
        // a missing-table error would surface as a 500, not a 400.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter StartupMigrationTests`
Expected: FAIL with a 500 response (Npgsql `relation "AspNetUsers" does not exist` or similar), not the expected 400.

- [ ] **Step 3: Add startup migration to `Program.cs`**

In `backend/LocaleBoost.Api/Program.cs`, immediately after `var app = builder.Build();` (`Program.cs:59`) and before `app.UseMiddleware<ExceptionHandlingMiddleware>();` (`Program.cs:61`), add:

```csharp
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}
```

This needs `Program.cs`'s top-level statements to support `await`, which they already do implicitly (top-level `Program.cs` compiles into an async `Main` when `await` is used) — no other signature change needed. Add the missing using if not already present:

```csharp
using Microsoft.Extensions.DependencyInjection;
```

(Likely already implicitly available via `ImplicitUsings` — check by building first; only add explicitly if the build fails on `CreateScope`/`GetRequiredService`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotnet test --filter StartupMigrationTests`
Expected: PASS.

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all tests PASS. (`CustomWebApplicationFactory`'s own `MigrateAsync()` call becomes redundant-but-harmless now that `Program.cs` also migrates — EF Core migrations are idempotent, leave the factory's call in place rather than touching shared test infra in this task.)

- [ ] **Step 6: Commit**

```bash
git add backend/LocaleBoost.Api/Program.cs backend/LocaleBoost.Api.Tests/IntegrationTests/StartupMigrationTests.cs
git commit -m "feat(backend): apply EF Core migrations automatically on startup"
```

---

### Task 3: Multi-stage Dockerfile building frontend + backend into one image

**Files:**
- Create: `Dockerfile` (repo root)
- Create: `.dockerignore` (repo root)

**Interfaces:**
- Consumes: `frontend/` (Angular project, builds to `frontend/dist/frontend/browser` per the Global Constraints), `backend/LocaleBoost.Api/` (builds/publishes via `dotnet publish`).
- Produces: a runtime image that, on `docker run -p 8080:8080 <image>`, serves the API under `/api/*` and the Angular app for everything else, listening on the port from the `PORT` env var (Railway convention) or `8080` by default.

- [ ] **Step 1: Write `.dockerignore`**

Create `.dockerignore` at repo root:

```
node_modules
frontend/node_modules
frontend/dist
frontend/.angular
backend/**/bin
backend/**/obj
dist
.vercel
.env
.env.local
.git
.remember
docs
```

- [ ] **Step 2: Write the Dockerfile**

Create `Dockerfile` at repo root:

```dockerfile
# --- Stage 1: build the Angular frontend ---
FROM node:22-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build and publish the .NET backend ---
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY backend/LocaleBoost.Api/LocaleBoost.Api.csproj backend/LocaleBoost.Api/
RUN dotnet restore backend/LocaleBoost.Api/LocaleBoost.Api.csproj
COPY backend/LocaleBoost.Api/ backend/LocaleBoost.Api/
RUN dotnet publish backend/LocaleBoost.Api/LocaleBoost.Api.csproj -c Release -o /app/publish --no-restore

# --- Stage 3: runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend-build /src/frontend/dist/frontend/browser ./wwwroot

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "LocaleBoost.Api.dll"]
```

- [ ] **Step 3: Build the image locally**

Run: `docker build -t localeboost-test .`
Expected: builds successfully through all three stages. This step has no automated assertion — it's a manual smoke test; if it fails, fix the Dockerfile and rerun before proceeding.

- [ ] **Step 4: Run the image locally and smoke-test it**

```bash
docker run --rm -p 8080:8080 \
  -e ConnectionStrings__DefaultConnection="Host=host.docker.internal;Database=localeboost;Username=postgres;Password=postgres" \
  -e Jwt__Key="local-docker-smoke-test-key-at-least-32-bytes-long" \
  -e Jwt__Issuer="LocaleBoost.Api" \
  -e Jwt__Audience="LocaleBoost.Client" \
  -e GoogleMaps__ApiKey="unused-for-this-smoke-test" \
  -e Claude__ApiKey="unused-for-this-smoke-test" \
  localeboost-test
```

(Requires a local Postgres reachable at that connection string — reuse whatever the backend's existing local dev setup uses; check `docs/superpowers/plans/2026-07-21-backend-api.md` if unsure how local Postgres was run for backend dev/testing.)

In another terminal:

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8080/
```

Expected: `/health` returns `200 {"status":"ok"}`; `/` returns `200` with the Angular `index.html` HTML content (not a 404 or a raw directory listing).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: add multi-stage Dockerfile for combined frontend+backend deploy"
```

---

### Task 4: Remove stray artifacts from the abandoned React/Vercel app

**Context:** The repo root still has untracked leftovers from the old React/Vite/Supabase/Vercel app (`.vercel/`, `dist/`, `node_modules/`, `.env`, `.env.local`) — all already gitignored, so this is pure local housekeeping, not a git operation. They're harmless to Docker builds (already excluded via `.dockerignore` from Task 3) but confusing to leave lying around now that the deploy target is Railway, not Vercel.

**Files:** none tracked in git — this task only touches the local working tree.

- [ ] **Step 1: Confirm nothing of value is in these paths**

```bash
git status --ignored | grep -E "^\s*(\.vercel|dist|node_modules|\.env)"
```

Expected: all four listed as ignored, none tracked. If `.env` or `.env.local` contain any secrets still worth preserving (e.g., a Google Maps key that's still valid), copy the specific values out before deleting — check with the user if unsure, since these were the old app's credentials and the design spec notes most were already unrecoverable.

- [ ] **Step 2: Remove the stray directories/files**

```bash
rm -rf /Users/wilson/Proyectos/buscador-clientes-web/.vercel
rm -rf /Users/wilson/Proyectos/buscador-clientes-web/dist
rm -rf /Users/wilson/Proyectos/buscador-clientes-web/node_modules
rm -f /Users/wilson/Proyectos/buscador-clientes-web/.env
rm -f /Users/wilson/Proyectos/buscador-clientes-web/.env.local
```

- [ ] **Step 3: Verify repo root is clean**

Run: `ls -la /Users/wilson/Proyectos/buscador-clientes-web`
Expected: only `.claude`, `.git`, `.gitignore`, `.remember`, `backend`, `docs`, `frontend`, `global.json`, and this plan's new `Dockerfile`/`.dockerignore`/`railway.toml` remain.

No commit needed — nothing here was tracked by git.

---

### Task 5: Provision the Railway project

**Context:** Railway CLI is installed (`~/.railway/bin/railway`, v5.23.2) and already authenticated as `wilson_loayza@hotmail.com`. `railway status` currently reports no project linked in this repo. **This task creates real cloud resources and needs the user present** to choose new-vs-existing project and to supply the real Google Maps and Anthropic API keys — do not guess or invent placeholder values for these.

**Files:**
- Create: `railway.toml` (repo root)

- [ ] **Step 1: Write `railway.toml` to force the Dockerfile builder**

Create `railway.toml` at repo root:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

- [ ] **Step 2: Create or link the Railway project (ask the user which)**

Ask the user: do they already have a Railway project for this app from elsewhere, or should this create a new one? Then run exactly one of:

```bash
railway init   # new project — will prompt for a project name
```

or

```bash
railway link   # existing project — will prompt to pick from their account
```

- [ ] **Step 3: Provision a Postgres plugin**

```bash
railway add --database postgres
```

Expected: a `Postgres` service appears in the project (confirm exact service name with `railway status` — later steps reference it by whatever name Railway assigns, commonly `Postgres`).

- [ ] **Step 4: Inspect the Postgres service's variables**

```bash
railway variables --service Postgres
```

Expected: shows `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (and `DATABASE_URL`). Note the exact service name shown — use it in Step 5's reference syntax if it differs from `Postgres`.

- [ ] **Step 5: Set the API service's environment variables**

Generate a strong JWT key:

```bash
openssl rand -base64 32
```

Set variables on the API service (replace `<api-service-name>` with whatever name Railway gave the service created in Step 2 — check with `railway status`; replace `<generated-key>` with Step 5's output; ask the user for their real Google Maps and Anthropic API keys rather than guessing):

```bash
railway variables --service <api-service-name> --set "ASPNETCORE_ENVIRONMENT=Production"
railway variables --service <api-service-name> --set "Jwt__Key=<generated-key>"
railway variables --service <api-service-name> --set "Jwt__Issuer=LocaleBoost.Api"
railway variables --service <api-service-name> --set "Jwt__Audience=LocaleBoost.Client"
railway variables --service <api-service-name> --set "GoogleMaps__ApiKey=<user-supplied-real-key>"
railway variables --service <api-service-name> --set "Claude__ApiKey=<user-supplied-real-key>"
railway variables --service <api-service-name> --set 'ConnectionStrings__DefaultConnection=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}}'
```

(`${{Postgres.PGHOST}}` etc. is Railway's cross-service reference-variable syntax — it resolves at deploy time, so the connection string always points at whichever Postgres instance is actually provisioned. Do not hardcode a host/password here.)

- [ ] **Step 6: Verify the variable set**

```bash
railway variables --service <api-service-name>
```

Expected: all six variables from Step 5 present, `Jwt__Key` not equal to the dev placeholder (`Program.cs`'s Production guard at `Program.cs:64-79` will refuse to start otherwise), `GoogleMaps__ApiKey` and `Claude__ApiKey` non-empty.

No commit needed for this task beyond `railway.toml` (Step 1) — the rest is remote Railway account state, not repo state.

```bash
git add railway.toml
git commit -m "build: configure Railway to deploy via Dockerfile"
```

---

### Task 6: Deploy, seed the first invite code, and smoke-test production

**Context:** Final task — ships the app and proves the whole flow works end to end against the real deployed URL. Requires Task 5 fully complete (real secrets set).

**Files:** none — this task is deploy + verification only.

- [ ] **Step 1: Deploy**

```bash
railway up --service <api-service-name>
```

Expected: build logs show all three Docker stages completing, then a successful deploy. Watch for the Production JWT-key guard (`Program.cs:64-79`) or a missing-variable error in the logs if it crash-loops — both mean Step 5 wasn't fully applied.

- [ ] **Step 2: Get the deployed URL**

```bash
railway domain
```

If no domain is generated yet, this command provisions a `*.up.railway.app` subdomain. Note the URL for the following steps.

- [ ] **Step 3: Confirm the app is up**

```bash
curl -i https://<railway-domain>/health
curl -i https://<railway-domain>/
```

Expected: `/health` → `200 {"status":"ok"}`. `/` → `200` with the Angular `index.html`, proving Task 1's static serving and Task 3's Docker image both work against the live deploy.

- [ ] **Step 4: Seed the first invite code**

Connect to the production database and insert one row. Easiest via Railway's Postgres connect shortcut:

```bash
railway connect Postgres
```

This opens a `psql` session against the live database. Run:

```sql
INSERT INTO "InviteCodes" ("Id", "Code", "IsUsed", "CreatedAt")
VALUES (gen_random_uuid(), 'localeboost-first-invite', false, now());
```

(Column names match `InviteCode` — `backend/LocaleBoost.Api/Data/Entities/InviteCode.cs` — as EF Core's default PascalCase-quoted mapping; verify with `\d "InviteCodes"` inside the same `psql` session if the insert fails on a column name mismatch.) Exit `psql` with `\q`.

- [ ] **Step 5: Smoke-test the full flow against production**

```bash
curl -i -X POST https://<railway-domain>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"<user-real-email>","password":"<a-real-password>1","inviteCode":"localeboost-first-invite"}'
```

Expected: `200` with `{"token":"..."}`. Then, using that token:

```bash
curl -i "https://<railway-domain>/api/businesses/search?query=coffee&location=Seattle" \
  -H "Authorization: Bearer <token-from-register>"
```

Expected: `200` with a `BusinessSearchResponse` — this proves the deployed API can reach the real Google Maps API with the Step 5 (Task 5) key. If this step is skipped to avoid a real Google Maps API charge, at minimum confirm login/register end-to-end and defer the search check to manual browser testing.

- [ ] **Step 6: Manual browser check**

Open `https://<railway-domain>/` in a browser, log in with the account created in Step 5, and confirm: search works, generating a website works (this one calls the real Claude API — costs real money, run it once deliberately, not repeatedly), and both history lists (searches, websites) populate. This is the final acceptance check for the whole plan — report back to the user rather than marking this done silently, since it's the first real usage of the production deploy.
