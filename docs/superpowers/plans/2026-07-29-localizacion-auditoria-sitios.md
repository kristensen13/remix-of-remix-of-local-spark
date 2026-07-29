# Localización a castellano + estado de sitio web y auditoría Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the whole app to Spanish, show whether each search result has a website (with its link), and — for results that already have a website — replace website generation with an audit of the existing site plus an improved HTML proposal.

**Architecture:** Same single ASP.NET Core service (API + Angular static build) on Railway, no new services or infrastructure. Adds one new backend service (`WebsiteFetcherService`, a typed `HttpClient` that fetches an existing site's HTML), extends `GoogleMapsService`/`ClaudeService`/`WebsitesController`/`BusinessesController` and their DTOs/entities, and updates every user-facing string across backend and frontend.

**Tech Stack:** ASP.NET Core 8, EF Core 8 + Npgsql, xUnit + `Testcontainers.PostgreSql` + `WebApplicationFactory<Program>` (backend tests), Angular 22 + Vitest (frontend), Anthropic C# SDK (`AnthropicClient`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-localizacion-auditoria-sitios-design.md` — read it for full rationale; this plan carries every exact value forward, but the spec is the source of truth if anything here seems to contradict it.
- No i18n library, no locale files, no language switcher — every string is directly rewritten to its Spanish version, in place.
- `GoogleMapsPlace` changes from `(string PlaceId, string Name, string Address, string? Phone, bool HasWebsite)` to `(string PlaceId, string Name, string Address, string? Phone, string? WebsiteUrl)` — `HasWebsite` is derived from `WebsiteUrl` at the mapping layer, never stored redundantly as a bool inside this record.
- `IGoogleMapsService`'s search method is renamed `SearchBusinessesWithoutWebsiteAsync` → `SearchBusinessesAsync(string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)`.
- `WebsiteFetcherService`: 10-second `HttpClient` timeout, HTML truncated to 50 000 characters, failures wrapped as `ExternalServiceException("No se pudo acceder al sitio web actual, intentá de nuevo.")`.
- Claude audit call (`AuditAndProposeWebsiteAsync`): `MaxTokens = 16000` (vs. 8192 for plain generation), response must be parsed as `{"audit": "...", "html": "..."}` JSON.
- `POST /api/websites/generate` keeps its existing request shape (`{ businessSearchResultId }`) — the backend decides generate-from-scratch vs. audit-and-propose based on whether the referenced `BusinessSearchResult.WebsiteUrl` is set. No new endpoint.
- One single EF Core migration covers all three new columns (`BusinessSearchResult.WebsiteUrl`, `GeneratedWebsite.AuditSummary`, `GeneratedWebsite.SourceWebsiteUrl`).
- Every task must leave the backend building and `dotnet test` green, and the frontend building and `npm test -- --watch=false` green, before its commit — several tasks touch shared test fakes (`FakeGoogleMapsService`, `FakeClaudeService` in `backend/LocaleBoost.Api.Tests/IntegrationTests/`) that other test files depend on; keep them compiling at every step.

---

## File Structure

Backend:
- `backend/LocaleBoost.Api/Controllers/AuthController.cs`, `BusinessesController.cs` — Spanish error messages (Task 1); `BusinessesController.cs` also gets `includeWithWebsite` wiring (Task 4).
- `backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs` — Spanish generic message (Task 1).
- `backend/LocaleBoost.Api/Services/GoogleMapsService.cs`, `IGoogleMapsService.cs` — Spanish message (Task 1); rename + record shape + conditional filter (Task 2).
- `backend/LocaleBoost.Api/Services/ClaudeService.cs`, `IClaudeService.cs` — Spanish message + prompt (Task 1); new `AuditAndProposeWebsiteAsync` (Task 8).
- `backend/LocaleBoost.Api/Services/IWebsiteFetcherService.cs`, `WebsiteFetcherService.cs` — new (Task 7).
- `backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs`, `GeneratedWebsite.cs` — new columns (Task 3).
- `backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs` — `HasWebsite`/`WebsiteUrl` (Task 4).
- `backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs` — `AuditSummary`/`SourceWebsiteUrl` on `GeneratedWebsiteDto` (Task 9).
- `backend/LocaleBoost.Api/Controllers/WebsitesController.cs` — branch generate-vs-audit (Task 9).
- `backend/LocaleBoost.Api/Program.cs` — register `IWebsiteFetcherService` (Task 7).
- `backend/LocaleBoost.Api/Migrations/` — one new migration (Task 3).

Frontend:
- `frontend/src/app/features/login/login.html`, `features/business-search/business-search.html`, `features/search-history/search-history.html`, `features/generated-websites/generated-websites.html`, `shared/layout/layout.html`, `shared/not-found/not-found.html` — Spanish text (Task 1).
- `frontend/src/app/core/http-error.util.ts`, `features/search-history/search-history.ts` — Spanish strings (Task 1).
- `frontend/src/app/core/models/business.models.ts` — `hasWebsite`/`websiteUrl` (Task 5).
- `frontend/src/app/features/business-search/business-search.service.ts`, `business-search.ts`, `business-search.html` — checkbox + display (Task 5); button label branch (Task 10).
- `frontend/src/app/features/search-history/search-history.html` — phone + website status in detail view (Task 6).
- `frontend/src/app/core/models/website.models.ts` — `auditSummary`/`sourceWebsiteUrl` (Task 10).
- `frontend/src/app/features/generated-websites/generated-websites.html` — audit block (Task 10).

---

### Task 1: Spanish localization — backend messages and frontend text

**Files:**
- Modify: `backend/LocaleBoost.Api/Controllers/AuthController.cs:40,57,74`
- Modify: `backend/LocaleBoost.Api/Controllers/BusinessesController.cs:34`
- Modify: `backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs` (the `"An unexpected error occurred."` title)
- Modify: `backend/LocaleBoost.Api/Services/GoogleMapsService.cs` (the `ExternalServiceException` message)
- Modify: `backend/LocaleBoost.Api/Services/ClaudeService.cs` (the `ExternalServiceException` message and the prompt)
- Modify: `backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs` (2 message assertions)
- Modify: `backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs` (1 message assertion)
- Modify: `backend/LocaleBoost.Api.Tests/UnitTests/ExceptionHandlingMiddlewareTests.cs` (1 message literal, for consistency with the real message)
- Modify: `frontend/src/app/features/login/login.html`
- Modify: `frontend/src/app/features/business-search/business-search.html`
- Modify: `frontend/src/app/features/search-history/search-history.html`
- Modify: `frontend/src/app/features/generated-websites/generated-websites.html`
- Modify: `frontend/src/app/shared/layout/layout.html`
- Modify: `frontend/src/app/shared/not-found/not-found.html`
- Modify: `frontend/src/app/core/http-error.util.ts`
- Modify: `frontend/src/app/features/search-history/search-history.ts` (the hardcoded `'Could not load this search.'` string)
- Modify: `frontend/src/app/features/search-history/search-history.spec.ts` (the assertion on that string)

**Interfaces:**
- Consumes: nothing new — every change is a literal string replacement in existing code.
- Produces: nothing new — no signatures change. Later tasks that touch the same files (Task 2 on `GoogleMapsService.cs`/`GoogleMapsServiceTests.cs`, Task 8 on `ClaudeService.cs`/`ClaudeServiceTests.cs`, Task 4 on `BusinessesController.cs`, Task 9 on `WebsitesController.cs`) build on top of the Spanish strings landed here — don't reintroduce English.

- [ ] **Step 1: Update the failing backend test assertions first (RED)**

In `backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs`, change both occurrences of:

```csharp
        Assert.Equal("Couldn't complete the search, try again.", ex.Message);
```

to:

```csharp
        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", ex.Message);
```

In `backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs`, change:

```csharp
        Assert.Equal("Couldn't generate the website, try again.", ex.Message);
```

to:

```csharp
        Assert.Equal("No se pudo generar el sitio web, intentá de nuevo.", ex.Message);
```

In `backend/LocaleBoost.Api.Tests/UnitTests/ExceptionHandlingMiddlewareTests.cs`, change both occurrences of `"Couldn't complete the search, try again."` (the one passed into `new ExternalServiceException(...)` and the one in the `Assert.Equal` for `title`) to `"No se pudo completar la búsqueda, intentá de nuevo."`.

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~GoogleMapsServiceTests|FullyQualifiedName~ClaudeServiceTests|FullyQualifiedName~ExceptionHandlingMiddlewareTests"`
Expected: FAIL — the test assertions now expect Spanish strings the production code doesn't return yet.

- [ ] **Step 3: Translate the backend message strings**

In `backend/LocaleBoost.Api/Controllers/AuthController.cs`:
- Line 40: `"Invalid or already used invite code."` → `"El código de invitación no es válido o ya fue usado."`
- Line 57: `"Registration failed. Please check your details and try again."` → `"No se pudo completar el registro. Revisá tus datos e intentá de nuevo."`
- Line 74: `"Invalid email or password."` → `"Correo electrónico o contraseña incorrectos."`

In `backend/LocaleBoost.Api/Controllers/BusinessesController.cs`, line 34: `"Query is required."` → `"El término de búsqueda es obligatorio."`

In `backend/LocaleBoost.Api/Services/GoogleMapsService.cs`, both places using `"Couldn't complete the search, try again."` → `"No se pudo completar la búsqueda, intentá de nuevo."`

In `backend/LocaleBoost.Api/Services/ClaudeService.cs`:
- `"Couldn't generate the website, try again."` → `"No se pudo generar el sitio web, intentá de nuevo."`
- The prompt string changes from:
```csharp
        var prompt =
            $"Generate a single self-contained HTML file for a simple landing page for this local business: " +
            $"Name: {businessName}. Address: {address}. Phone: {phone ?? "not provided"}. " +
            "Return only the HTML, no explanation.";
```
to:
```csharp
        var prompt =
            $"Generá un único archivo HTML autocontenido para una landing page simple de este negocio local, " +
            $"en castellano: Nombre: {businessName}. Dirección: {address}. Teléfono: {phone ?? "no disponible"}. " +
            "Respondé únicamente con el HTML, sin explicaciones.";
```

In `backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs`, the unhandled-exception branch's `title = "An unexpected error occurred."` → `title = "Ocurrió un error inesperado."`

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `cd backend && dotnet test`
Expected: all 28 tests PASS (no count change — only message literals changed).

- [ ] **Step 5: Translate the frontend templates**

In `frontend/src/app/features/login/login.html`: `"Log in"` → `"Iniciar sesión"` (both the tab button and the submit button's non-loading label), `"Register"` → `"Registrarse"`, `"Email"` (both placeholders) → `"Correo electrónico"`, `"Password"` → `"Contraseña"`, `"Password (min 8 characters)"` → `"Contraseña (mín. 8 caracteres)"`, `"Invite code"` → `"Código de invitación"`, `"Logging in…"` → `"Iniciando sesión…"`, `"Registering…"` → `"Registrando…"`.

In `frontend/src/app/features/business-search/business-search.html`: `"Search for businesses without a website"` → `"Buscar negocios locales"`, `"e.g. plumbers"` → `"ej. plomeros"`, `"Location (optional)"` → `"Ubicación (opcional)"`, `"Searching…"` → `"Buscando…"`, `"Search"` → `"Buscar"`, `"Generating…"` → `"Generando…"`, `"Generate website"` → `"Generar sitio web"`, `"No results yet — run a search above."` → `"Todavía no hay resultados — hacé una búsqueda arriba."`.

In `frontend/src/app/features/search-history/search-history.html`: `"Past searches"` → `"Búsquedas anteriores"`, `"Loading…"` → `"Cargando…"`, `"No searches yet."` → `"Todavía no hay búsquedas."`, `"result(s)"` → `"resultado(s)"`.

In `frontend/src/app/features/generated-websites/generated-websites.html`: `"Generated websites"` → `"Sitios generados"`, `"Loading…"` → `"Cargando…"`, `"No generated websites yet."` → `"Todavía no hay sitios generados."`, `"Preview"` → `"Vista previa"`, `"Close"` → `"Cerrar"`.

In `frontend/src/app/shared/layout/layout.html`: `"Search"` → `"Buscar"`, `"History"` → `"Historial"`, `"Websites"` → `"Sitios"`, `"Log out"` → `"Cerrar sesión"`.

In `frontend/src/app/shared/not-found/not-found.html`: `"Page not found"` → `"Página no encontrada"`, `"Back to search"` → `"Volver a la búsqueda"`.

- [ ] **Step 6: Translate the frontend hardcoded strings and their test**

In `frontend/src/app/core/http-error.util.ts`, change:

```typescript
  return 'An unexpected error occurred. Please try again.';
```

to:

```typescript
  return 'Ocurrió un error inesperado. Intentá de nuevo.';
```

In `frontend/src/app/features/search-history/search-history.spec.ts`, change:

```typescript
    expect(component.detailError()).toBe('Could not load this search.');
```

to:

```typescript
    expect(component.detailError()).toBe('No se pudo cargar esta búsqueda.');
```

Run: `cd frontend && npm test -- --watch=false --testNamePattern="viewDetail sets detailError on failure"`
Expected: FAIL — `search-history.ts` still sets the English string.

In `frontend/src/app/features/search-history/search-history.ts`, change:

```typescript
      this.detailError.set('Could not load this search.');
```

to:

```typescript
      this.detailError.set('No se pudo cargar esta búsqueda.');
```

- [ ] **Step 7: Run the full frontend suite to verify everything passes**

Run: `cd frontend && npm test -- --watch=false`
Expected: all 47 tests PASS (no count change).

Run: `cd frontend && npm run build`
Expected: builds cleanly (confirms the translated templates have no stray syntax errors).

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Controllers/AuthController.cs backend/LocaleBoost.Api/Controllers/BusinessesController.cs backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs backend/LocaleBoost.Api/Services/GoogleMapsService.cs backend/LocaleBoost.Api/Services/ClaudeService.cs backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs backend/LocaleBoost.Api.Tests/UnitTests/ExceptionHandlingMiddlewareTests.cs frontend/src/app/features/login/login.html frontend/src/app/features/business-search/business-search.html frontend/src/app/features/search-history/search-history.html frontend/src/app/features/search-history/search-history.ts frontend/src/app/features/search-history/search-history.spec.ts frontend/src/app/features/generated-websites/generated-websites.html frontend/src/app/shared/layout/layout.html frontend/src/app/shared/not-found/not-found.html frontend/src/app/core/http-error.util.ts
git commit -m "feat: translate app to Spanish (backend messages, frontend text, Claude prompt)"
```

---

### Task 2: `GoogleMapsService` — rename search method, replace `HasWebsite` with `WebsiteUrl`, conditional filter

**Files:**
- Modify: `backend/LocaleBoost.Api/Services/IGoogleMapsService.cs`
- Modify: `backend/LocaleBoost.Api/Services/GoogleMapsService.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/BusinessesController.cs` (just the call site, to keep the build green — full `includeWithWebsite` wiring is Task 4)
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs` (the shared `FakeGoogleMapsService`, just to keep it compiling — full behavior update is Task 4)
- Modify: `backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs`

**Interfaces:**
- Consumes: `ExternalServiceException` (existing, unchanged).
- Produces: `GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, string? WebsiteUrl)` and `IGoogleMapsService.SearchBusinessesAsync(string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)` — every later task that calls the Google Maps service (Task 4) uses this exact signature.

- [ ] **Step 1: Write the failing test**

In `backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs`, rename every call to `service.SearchBusinessesWithoutWebsiteAsync(...)` to `service.SearchBusinessesAsync("cafes", "Madrid", includeWithWebsite: false)` (three call sites: the two exception tests and the filtering test — each already passes `"cafes", "Madrid"` as its first two arguments, just add `includeWithWebsite: false` as the third).

Also update the method names themselves (they encode the old behavior) and the filtering test's fixture — replace:

```csharp
    [Fact]
    public async Task SearchBusinessesWithoutWebsiteAsync_FiltersOutPlacesWithWebsite()
    {
        var json = JsonSerializer.Serialize(new
        {
            places = new object[]
            {
                new { id = "1", displayName = new { text = "No Website Cafe" }, formattedAddress = "Main St 1", nationalPhoneNumber = "111", websiteUri = (string?)null },
                new { id = "2", displayName = new { text = "Has Website Bakery" }, formattedAddress = "Main St 2", nationalPhoneNumber = "222", websiteUri = "https://bakery.example.com" }
            }
        });

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var results = await service.SearchBusinessesWithoutWebsiteAsync("cafes", "Madrid");

        Assert.Single(results);
        Assert.Equal("No Website Cafe", results[0].Name);
    }
```

with:

```csharp
    [Fact]
    public async Task SearchBusinessesAsync_WhenIncludeWithWebsiteIsFalse_FiltersOutPlacesWithWebsite()
    {
        var json = JsonSerializer.Serialize(new
        {
            places = new object[]
            {
                new { id = "1", displayName = new { text = "No Website Cafe" }, formattedAddress = "Main St 1", nationalPhoneNumber = "111", websiteUri = (string?)null },
                new { id = "2", displayName = new { text = "Has Website Bakery" }, formattedAddress = "Main St 2", nationalPhoneNumber = "222", websiteUri = "https://bakery.example.com" }
            }
        });

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var results = await service.SearchBusinessesAsync("cafes", "Madrid", includeWithWebsite: false);

        Assert.Single(results);
        Assert.Equal("No Website Cafe", results[0].Name);
        Assert.Null(results[0].WebsiteUrl);
    }

    [Fact]
    public async Task SearchBusinessesAsync_WhenIncludeWithWebsiteIsTrue_ReturnsAllPlacesWithTheirWebsiteUrl()
    {
        var json = JsonSerializer.Serialize(new
        {
            places = new object[]
            {
                new { id = "1", displayName = new { text = "No Website Cafe" }, formattedAddress = "Main St 1", nationalPhoneNumber = "111", websiteUri = (string?)null },
                new { id = "2", displayName = new { text = "Has Website Bakery" }, formattedAddress = "Main St 2", nationalPhoneNumber = "222", websiteUri = "https://bakery.example.com" }
            }
        });

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var results = await service.SearchBusinessesAsync("cafes", "Madrid", includeWithWebsite: true);

        Assert.Equal(2, results.Count);
        Assert.Null(results.Single(r => r.Name == "No Website Cafe").WebsiteUrl);
        Assert.Equal("https://bakery.example.com", results.Single(r => r.Name == "Has Website Bakery").WebsiteUrl);
    }
```

Add `using System.Linq;` to the top of the file if not already present (needed for `.Single(...)`).

Also rename the two exception tests and update their call site — by this point Task 1 has already changed their `Assert.Equal` line to the Spanish message, so only the method name and the `SearchBusinessesWithoutWebsiteAsync` call change here. Replace:

```csharp
    [Fact]
    public async Task SearchBusinessesWithoutWebsiteAsync_WhenHttpRequestExceptionThrown_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ThrowingHandler())
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.SearchBusinessesWithoutWebsiteAsync("cafes", "Madrid"));

        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }

    [Fact]
    public async Task SearchBusinessesWithoutWebsiteAsync_WhenUpstreamReturnsErrorStatus_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler())
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.SearchBusinessesWithoutWebsiteAsync("cafes", "Madrid"));

        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }
```

with:

```csharp
    [Fact]
    public async Task SearchBusinessesAsync_WhenHttpRequestExceptionThrown_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ThrowingHandler())
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.SearchBusinessesAsync("cafes", "Madrid", includeWithWebsite: false));

        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }

    [Fact]
    public async Task SearchBusinessesAsync_WhenUpstreamReturnsErrorStatus_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler())
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.SearchBusinessesAsync("cafes", "Madrid", includeWithWebsite: false));

        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~GoogleMapsServiceTests"`
Expected: FAIL — build error, `SearchBusinessesAsync` doesn't exist yet and `GoogleMapsPlace` still has `HasWebsite`, not `WebsiteUrl`.

- [ ] **Step 3: Update `IGoogleMapsService.cs`**

```csharp
namespace LocaleBoost.Api.Services;

public record GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, string? WebsiteUrl);

public interface IGoogleMapsService
{
    Task<List<GoogleMapsPlace>> SearchBusinessesAsync(
        string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 4: Update `GoogleMapsService.cs`**

Replace the method signature and body:

```csharp
    public async Task<List<GoogleMapsPlace>> SearchBusinessesAsync(
        string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)
    {
        var textQuery = string.IsNullOrWhiteSpace(location) ? query : $"{query} {location}";

        var request = new HttpRequestMessage(HttpMethod.Post, "v1/places:searchText")
        {
            Content = JsonContent.Create(new { textQuery })
        };
        request.Headers.Add("X-Goog-Api-Key", _configuration["GoogleMaps:ApiKey"]);
        request.Headers.Add("X-Goog-FieldMask",
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri");

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ExternalServiceException("No se pudo completar la búsqueda, intentá de nuevo.", ex);
        }

        var payload = await response.Content.ReadFromJsonAsync<PlacesSearchResponse>(
            cancellationToken: cancellationToken);

        var places = (payload?.Places ?? new List<PlaceResult>()).AsEnumerable();
        if (!includeWithWebsite)
        {
            places = places.Where(p => string.IsNullOrWhiteSpace(p.WebsiteUri));
        }

        return places
            .Select(p => new GoogleMapsPlace(
                p.Id,
                p.DisplayName?.Text ?? string.Empty,
                p.FormattedAddress ?? string.Empty,
                p.NationalPhoneNumber,
                p.WebsiteUri))
            .ToList();
    }
```

(The rest of the file — `PlacesSearchResponse`, `PlaceResult`, `DisplayName` private classes — is unchanged.)

- [ ] **Step 5: Fix the call site in `BusinessesController.cs`**

Change:

```csharp
        var places = await _googleMaps.SearchBusinessesWithoutWebsiteAsync(query, location);
```

to:

```csharp
        var places = await _googleMaps.SearchBusinessesAsync(query, location, includeWithWebsite: false);
```

And the mapping below it — `HasWebsite = p.HasWebsite` no longer compiles since `GoogleMapsPlace` has no `HasWebsite` member. Change:

```csharp
            Results = places.Select(p => new BusinessSearchResult
            {
                Id = Guid.NewGuid(),
                PlaceId = p.PlaceId,
                Name = p.Name,
                Address = p.Address,
                Phone = p.Phone,
                HasWebsite = p.HasWebsite
            }).ToList()
```

to:

```csharp
            Results = places.Select(p => new BusinessSearchResult
            {
                Id = Guid.NewGuid(),
                PlaceId = p.PlaceId,
                Name = p.Name,
                Address = p.Address,
                Phone = p.Phone,
                HasWebsite = !string.IsNullOrWhiteSpace(p.WebsiteUrl)
            }).ToList()
```

(`includeWithWebsite: false` is a temporary hardcoded value here — Task 4 replaces it with the real query parameter. `HasWebsite` still compiles today because that column already exists on `BusinessSearchResult`, from the original backend plan.)

- [ ] **Step 6: Fix the shared `FakeGoogleMapsService` in `BusinessesControllerTests.cs`**

Change:

```csharp
public class FakeGoogleMapsService : IGoogleMapsService
{
    public Task<List<GoogleMapsPlace>> SearchBusinessesWithoutWebsiteAsync(
        string query, string? location, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new List<GoogleMapsPlace>
        {
            new("place-1", "Test Business", "Test Address 1", "555-0001", false)
        });
    }
}
```

to:

```csharp
public class FakeGoogleMapsService : IGoogleMapsService
{
    public Task<List<GoogleMapsPlace>> SearchBusinessesAsync(
        string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new List<GoogleMapsPlace>
        {
            new("place-1", "Test Business", "Test Address 1", "555-0001", null)
        });
    }
}
```

(This keeps every existing test that depends on this fake — in `BusinessesControllerTests.cs`, `WebsitesControllerTests.cs`, `BusinessSearchHistoryTests.cs` — passing with exactly one no-website result, same as before. Task 4 upgrades this fake to also return a with-website result and to honor `includeWithWebsite`.)

- [ ] **Step 7: Run the full backend suite to verify everything passes**

Run: `cd backend && dotnet test`
Expected: all tests PASS — 28 existing plus 1 new (`SearchBusinessesAsync_WhenIncludeWithWebsiteIsTrue_ReturnsAllPlacesWithTheirWebsiteUrl`) = 29.

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Services/IGoogleMapsService.cs backend/LocaleBoost.Api/Services/GoogleMapsService.cs backend/LocaleBoost.Api/Controllers/BusinessesController.cs backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs
git commit -m "refactor(backend): rename GoogleMapsService search method, replace HasWebsite with WebsiteUrl"
```

---

### Task 3: Persisted fields for website URL and audit — entity changes + one EF Core migration

**Files:**
- Modify: `backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs`
- Modify: `backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/EntityPersistenceTests.cs`
- Create: `backend/LocaleBoost.Api/Migrations/<timestamp>_AddWebsiteStatusAndAuditFields.cs` (and its `.Designer.cs`, plus an updated `AppDbContextModelSnapshot.cs`) — generated by `dotnet ef`, not hand-written.

**Interfaces:**
- Consumes: `AppDbContext`, `CustomWebApplicationFactory` (existing).
- Produces: `BusinessSearchResult.WebsiteUrl` (`string?`), `GeneratedWebsite.AuditSummary` (`string?`), `GeneratedWebsite.SourceWebsiteUrl` (`string?`) — Task 4 reads/writes `BusinessSearchResult.WebsiteUrl`; Task 9 reads/writes both `GeneratedWebsite` fields.

- [ ] **Step 1: Write the failing test**

In `backend/LocaleBoost.Api.Tests/IntegrationTests/EntityPersistenceTests.cs`, change the `search` construction's single result and the `GeneratedWebsites.Add(...)` call, and extend the final assertions:

```csharp
        var search = new BusinessSearch
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Query = "cafes",
            Location = "Madrid",
            CreatedAt = DateTime.UtcNow,
            Results = new List<BusinessSearchResult>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PlaceId = "place-1",
                    Name = "Test Cafe",
                    Address = "Main St 1",
                    Phone = "555-0001",
                    HasWebsite = true,
                    WebsiteUrl = "https://test-cafe.example.com"
                }
            }
        };
        db.BusinessSearches.Add(search);

        db.InviteCodes.Add(new InviteCode
        {
            Id = Guid.NewGuid(),
            Code = "TEST-CODE",
            IsUsed = false,
            CreatedAt = DateTime.UtcNow
        });

        db.GeneratedWebsites.Add(new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            BusinessName = "Test Cafe",
            BusinessAddress = "Main St 1",
            BusinessPhone = "555-0001",
            GeneratedContent = "<html></html>",
            AuditSummary = "Le falta meta descripción y no es responsive.",
            SourceWebsiteUrl = "https://test-cafe.example.com",
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();

        var reloaded = await db.BusinessSearches
            .Include(s => s.Results)
            .SingleAsync(s => s.Id == search.Id);

        Assert.Single(reloaded.Results);
        Assert.Equal("Test Cafe", reloaded.Results[0].Name);
        Assert.Equal("https://test-cafe.example.com", reloaded.Results[0].WebsiteUrl);

        var reloadedWebsite = await db.GeneratedWebsites.SingleAsync(w => w.UserId == userId);
        Assert.Equal("Le falta meta descripción y no es responsive.", reloadedWebsite.AuditSummary);
        Assert.Equal("https://test-cafe.example.com", reloadedWebsite.SourceWebsiteUrl);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~EntityPersistenceTests"`
Expected: FAIL — build error, `BusinessSearchResult.WebsiteUrl`, `GeneratedWebsite.AuditSummary`, `GeneratedWebsite.SourceWebsiteUrl` don't exist yet.

- [ ] **Step 3: Add the new entity properties**

`backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs`:

```csharp
namespace LocaleBoost.Api.Data.Entities;

public class BusinessSearchResult
{
    public Guid Id { get; set; }
    public Guid BusinessSearchId { get; set; }
    public string PlaceId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public bool HasWebsite { get; set; }
    public string? WebsiteUrl { get; set; }
}
```

`backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs`:

```csharp
namespace LocaleBoost.Api.Data.Entities;

public class GeneratedWebsite
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessAddress { get; set; } = string.Empty;
    public string? BusinessPhone { get; set; }
    public string GeneratedContent { get; set; } = string.Empty;
    public string? AuditSummary { get; set; }
    public string? SourceWebsiteUrl { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

- [ ] **Step 4: Generate the migration**

```bash
dotnet ef migrations add AddWebsiteStatusAndAuditFields --project backend/LocaleBoost.Api --startup-project backend/LocaleBoost.Api
```

Expected: a new migration file adding `WebsiteUrl` to `BusinessSearchResults` and `AuditSummary`/`SourceWebsiteUrl` to `GeneratedWebsites`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~EntityPersistenceTests"`
Expected: PASS

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all 29 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs backend/LocaleBoost.Api/Migrations/ backend/LocaleBoost.Api.Tests/IntegrationTests/EntityPersistenceTests.cs
git commit -m "feat(backend): add WebsiteUrl, AuditSummary, SourceWebsiteUrl columns"
```

---

### Task 4: `BusinessesController` — wire `includeWithWebsite`, expose website status in the DTO

**Files:**
- Modify: `backend/LocaleBoost.Api/Controllers/BusinessesController.cs`
- Modify: `backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs`

**Interfaces:**
- Consumes: `IGoogleMapsService.SearchBusinessesAsync(query, location, includeWithWebsite, ct)` (Task 2), `BusinessSearchResult.WebsiteUrl` (Task 3).
- Produces: `BusinessSearchResultDto(Guid Id, string PlaceId, string Name, string Address, string? Phone, bool HasWebsite, string? WebsiteUrl)` — Task 5 (frontend model) and Task 9 (audit branch, reads the same `BusinessSearchResult.WebsiteUrl` this task persists) depend on this exact shape. `FakeGoogleMapsService` now returns two results (one with a website, one without) whenever `includeWithWebsite` is `true` — Task 9's audit test picks the with-website one from this fake.

- [ ] **Step 1: Write the failing test**

In `backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs`, update the shared fake to honor `includeWithWebsite` and add a with-website result:

```csharp
public class FakeGoogleMapsService : IGoogleMapsService
{
    public Task<List<GoogleMapsPlace>> SearchBusinessesAsync(
        string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)
    {
        var places = new List<GoogleMapsPlace>
        {
            new("place-1", "Test Business", "Test Address 1", "555-0001", null)
        };

        if (includeWithWebsite)
        {
            places.Add(new("place-2", "Test Business With Website", "Test Address 2", "555-0002", "https://existing-site.example.com"));
        }

        return Task.FromResult(places);
    }
}
```

Add a new test:

```csharp
    [Fact]
    public async Task Search_WithIncludeWithWebsiteTrue_ReturnsBothBusinessesWithCorrectWebsiteStatus()
    {
        var client = await CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/businesses/search?query=cafes&includeWithWebsite=true");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        Assert.Equal(2, body!.Results.Count);

        var withoutWebsite = body.Results.Single(r => r.Name == "Test Business");
        Assert.False(withoutWebsite.HasWebsite);
        Assert.Null(withoutWebsite.WebsiteUrl);

        var withWebsite = body.Results.Single(r => r.Name == "Test Business With Website");
        Assert.True(withWebsite.HasWebsite);
        Assert.Equal("https://existing-site.example.com", withWebsite.WebsiteUrl);
    }
```

Add `using System.Linq;` to the top of the file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~BusinessesControllerTests"`
Expected: FAIL — build error (`BusinessSearchResultDto` has no `HasWebsite`/`WebsiteUrl` members yet) or, once that's stubbed, the new test fails because the endpoint doesn't accept `includeWithWebsite` yet and always returns 1 result.

- [ ] **Step 3: Add the fields to the DTO**

`backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`:

```csharp
namespace LocaleBoost.Api.Dtos.Businesses;

public record BusinessSearchResultDto(
    Guid Id, string PlaceId, string Name, string Address, string? Phone, bool HasWebsite, string? WebsiteUrl);

public record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results);

public record BusinessSearchSummaryDto(Guid Id, string Query, string? Location, DateTime CreatedAt, int ResultCount);

public record BusinessSearchDetailDto(
    Guid Id, string Query, string? Location, DateTime CreatedAt, List<BusinessSearchResultDto> Results);
```

- [ ] **Step 4: Wire `includeWithWebsite` through `BusinessesController.Search` and map the new DTO fields**

Change the `Search` action's signature and body in `backend/LocaleBoost.Api/Controllers/BusinessesController.cs`:

```csharp
    [HttpGet("search")]
    public async Task<ActionResult<BusinessSearchResponse>> Search(
        [FromQuery] string query, [FromQuery] string? location, [FromQuery] bool includeWithWebsite = false)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "El término de búsqueda es obligatorio." });
        }

        var places = await _googleMaps.SearchBusinessesAsync(query, location, includeWithWebsite);

        var search = new BusinessSearch
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Query = query,
            Location = location,
            CreatedAt = DateTime.UtcNow,
            Results = places.Select(p => new BusinessSearchResult
            {
                Id = Guid.NewGuid(),
                PlaceId = p.PlaceId,
                Name = p.Name,
                Address = p.Address,
                Phone = p.Phone,
                HasWebsite = !string.IsNullOrWhiteSpace(p.WebsiteUrl),
                WebsiteUrl = p.WebsiteUrl
            }).ToList()
        };

        _db.BusinessSearches.Add(search);
        await _db.SaveChangesAsync();

        return Ok(new BusinessSearchResponse(
            search.Id,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone, r.HasWebsite, r.WebsiteUrl))
                .ToList()));
    }
```

And update the two other `BusinessSearchResultDto` constructions in the same file (`GetSearchById`) the same way:

```csharp
        return Ok(new BusinessSearchDetailDto(
            search.Id,
            search.Query,
            search.Location,
            search.CreatedAt,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone, r.HasWebsite, r.WebsiteUrl))
                .ToList()));
```

(The `Query is required.` message was already translated in Task 1 — this step shows it in place for context, not as a new change.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~BusinessesControllerTests"`
Expected: PASS

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all tests PASS — 29 existing plus 1 new = 30. (`Search_WithAuth_PersistsAndReturnsResults` still passes: with `includeWithWebsite` defaulting to `false`, the fake still returns only the no-website result, same as before Task 4.)

- [ ] **Step 7: Commit**

```bash
git add backend/LocaleBoost.Api/Controllers/BusinessesController.cs backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs
git commit -m "feat(backend): expose website status/url in search results, add includeWithWebsite filter"
```

---

### Task 5: Frontend — website status/link in search results, `includeWithWebsite` checkbox

**Files:**
- Modify: `frontend/src/app/core/models/business.models.ts`
- Modify: `frontend/src/app/features/business-search/business-search.service.ts`
- Modify: `frontend/src/app/features/business-search/business-search.ts`
- Modify: `frontend/src/app/features/business-search/business-search.html`
- Modify: `frontend/src/app/features/business-search/business-search.service.spec.ts`
- Modify: `frontend/src/app/features/business-search/business-search.spec.ts`

**Interfaces:**
- Consumes: `BusinessSearchResponse`/`BusinessSearchResultDto` shape from Task 4 (`hasWebsite: boolean`, `websiteUrl: string | null` on each result, camelCase as ASP.NET Core's default JSON serialization produces).
- Produces: `BusinessSearchResult` (frontend model) with `hasWebsite`/`websiteUrl` — Task 6 (search-history detail view) and Task 10 (button label) read these same fields.

- [ ] **Step 1: Write the failing test**

In `frontend/src/app/features/business-search/business-search.service.spec.ts`, update the first test's fixtures and add a new test for the `includeWithWebsite` param:

```typescript
  it('populates results on a successful search', async () => {
    const searchPromise = service.search('plumbers', 'Madrid', false);

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/businesses/search' &&
        r.params.get('query') === 'plumbers' &&
        r.params.get('location') === 'Madrid',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      searchId: 's1',
      results: [
        { id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null, hasWebsite: false, websiteUrl: null },
      ],
    });

    await searchPromise;

    expect(service.results()).toEqual([
      { id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null, hasWebsite: false, websiteUrl: null },
    ]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('omits the location param when none is given', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.has('location')).toBe(false);
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('omits the includeWithWebsite param when false', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.has('includeWithWebsite')).toBe(false);
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('includes includeWithWebsite=true when true', async () => {
    const searchPromise = service.search('plumbers', null, true);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.get('includeWithWebsite')).toBe('true');
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('sets errorMessage and clears results on failure', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    req.flush({ message: 'El término de búsqueda es obligatorio.' }, { status: 400, statusText: 'Bad Request' });

    await searchPromise;

    expect(service.errorMessage()).toBe('El término de búsqueda es obligatorio.');
    expect(service.results()).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --watch=false`
Expected: FAIL — `service.search` doesn't accept a third argument yet, and `BusinessSearchResult` has no `hasWebsite`/`websiteUrl` (TypeScript build errors surface as test failures under Vitest).

- [ ] **Step 3: Update the model**

`frontend/src/app/core/models/business.models.ts`:

```typescript
export interface BusinessSearchResult {
  id: string;
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  hasWebsite: boolean;
  websiteUrl: string | null;
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

- [ ] **Step 4: Update `business-search.service.ts`**

```typescript
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

  async search(query: string, location: string | null, includeWithWebsite: boolean): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let params = new HttpParams().set('query', query);
    if (location) {
      params = params.set('location', location);
    }
    if (includeWithWebsite) {
      params = params.set('includeWithWebsite', 'true');
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

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- --watch=false`
Expected: `business-search.service.spec.ts` PASSES. `business-search.spec.ts` still FAILS (component doesn't pass the third argument yet) — expected at this point, fixed in the next steps.

- [ ] **Step 6: Update `business-search.ts` and its test**

In `frontend/src/app/features/business-search/business-search.spec.ts`, update every inline `BusinessSearchResult` fixture to add `hasWebsite: false, websiteUrl: null` (four occurrences: the `onGenerate` call in `'calls GeneratedWebsitesService.generate with the result id'`, and the two in `'tracks which result is currently generating'`), and update the `search` assertions to include the third argument:

```typescript
  it('calls search with a trimmed query and null location when location is blank', () => {
    component.query.set('  plumbers  ');
    component.location.set('   ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', null, false);
  });

  it('calls search with the trimmed location when one is given', () => {
    component.query.set('plumbers');
    component.location.set(' Madrid ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', 'Madrid', false);
  });
```

Add a new test:

```typescript
  it('calls search with includeWithWebsite when the checkbox is checked', () => {
    component.query.set('plumbers');
    component.includeWithWebsite.set(true);
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', null, true);
  });
```

Update `business-search.ts`:

```typescript
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
  readonly includeWithWebsite = signal(false);

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
    void this.searchService.search(trimmedQuery, trimmedLocation || null, this.includeWithWebsite());
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

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npm test -- --watch=false`
Expected: PASS — all existing tests plus the 3 new ones (2 in `business-search.service.spec.ts`, 1 in `business-search.spec.ts`).

- [ ] **Step 8: Update `business-search.html`**

```html
<div class="mx-auto max-w-3xl p-6">
  <h1 class="mb-4 text-xl font-semibold">Buscar negocios locales</h1>

  <form (ngSubmit)="onSubmit()" class="mb-6 flex flex-col gap-3">
    <div class="flex flex-wrap gap-3">
      <input
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        name="query"
        type="text"
        placeholder="ej. plomeros"
        class="flex-1 rounded border border-slate-300 px-3 py-2"
      />
      <input
        [ngModel]="location()"
        (ngModelChange)="location.set($event)"
        name="location"
        type="text"
        placeholder="Ubicación (opcional)"
        class="flex-1 rounded border border-slate-300 px-3 py-2"
      />
      <button
        type="submit"
        [disabled]="isLoading()"
        class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {{ isLoading() ? 'Buscando…' : 'Buscar' }}
      </button>
    </div>
    <label class="flex items-center gap-2 text-sm text-slate-600">
      <input
        [ngModel]="includeWithWebsite()"
        (ngModelChange)="includeWithWebsite.set($event)"
        name="includeWithWebsite"
        type="checkbox"
      />
      Incluir negocios que ya tienen sitio web
    </label>
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
          @if (result.hasWebsite) {
            <p class="text-sm text-slate-600">
              <a [href]="result.websiteUrl" target="_blank" rel="noopener" class="underline">Ver sitio actual</a>
            </p>
          } @else {
            <p class="text-sm text-slate-500">Sin sitio web</p>
          }
          <button
            type="button"
            [disabled]="generatingResultId() === result.id"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            (click)="onGenerate(result)"
          >
            {{ generatingResultId() === result.id ? 'Generando…' : 'Generar sitio web' }}
          </button>
        </li>
      }
    </ul>
  } @else if (!isLoading()) {
    <p class="text-sm text-slate-500">Todavía no hay resultados — hacé una búsqueda arriba.</p>
  }

  @if (generateError()) {
    <p class="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ generateError() }}</p>
  }
</div>
```

(The button label/loading text stays generic here — Task 10 makes it conditional on `result.hasWebsite` once the audit flow exists.)

- [ ] **Step 9: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --watch=false`
Expected: all tests PASS.

Run: `cd frontend && npm run build`
Expected: builds cleanly.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/core/models/business.models.ts frontend/src/app/features/business-search/business-search.service.ts frontend/src/app/features/business-search/business-search.ts frontend/src/app/features/business-search/business-search.html frontend/src/app/features/business-search/business-search.service.spec.ts frontend/src/app/features/business-search/business-search.spec.ts
git commit -m "feat(frontend): show website status/link in search results, add includeWithWebsite checkbox"
```

---

### Task 6: Frontend — search history detail view shows phone and website status

**Files:**
- Modify: `frontend/src/app/features/search-history/search-history.html`

**Interfaces:**
- Consumes: `BusinessSearchDetail.results: BusinessSearchResult[]` — already carries `hasWebsite`/`websiteUrl` from Task 5's model change (the same `BusinessSearchResult` interface is shared between the search feature and the history feature).
- Produces: nothing new for later tasks — this is a leaf, template-only change.

- [ ] **Step 1: Update the template**

In `frontend/src/app/features/search-history/search-history.html`, the detail block currently renders:

```html
        @for (result of detail.results; track result.id) {
          <li class="text-sm text-slate-600">{{ result.name }} — {{ result.address }}</li>
        }
```

Replace with:

```html
        @for (result of detail.results; track result.id) {
          <li class="text-sm text-slate-600">
            <p>{{ result.name }} — {{ result.address }}</p>
            @if (result.phone) {
              <p>{{ result.phone }}</p>
            }
            @if (result.hasWebsite) {
              <p><a [href]="result.websiteUrl" target="_blank" rel="noopener" class="underline">Ver sitio actual</a></p>
            } @else {
              <p class="text-slate-500">Sin sitio web</p>
            }
          </li>
        }
```

- [ ] **Step 2: Run the full frontend suite and build to check for regressions**

Run: `cd frontend && npm test -- --watch=false`
Expected: all tests PASS (no test covers this template's rendered output today, so no test count change — this step exists to catch any accidental syntax break).

Run: `cd frontend && npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/search-history/search-history.html
git commit -m "feat(frontend): show phone and website status in search history detail"
```

---

### Task 7: `WebsiteFetcherService` — fetch an existing site's HTML

**Files:**
- Create: `backend/LocaleBoost.Api/Services/IWebsiteFetcherService.cs`
- Create: `backend/LocaleBoost.Api/Services/WebsiteFetcherService.cs`
- Create: `backend/LocaleBoost.Api.Tests/UnitTests/WebsiteFetcherServiceTests.cs`
- Modify: `backend/LocaleBoost.Api/Program.cs`

**Interfaces:**
- Consumes: `ExternalServiceException` (existing).
- Produces: `IWebsiteFetcherService.FetchHtmlAsync(string url, CancellationToken cancellationToken = default) : Task<string>` — Task 9 (`WebsitesController`) calls this.

- [ ] **Step 1: Write the failing test**

Create `backend/LocaleBoost.Api.Tests/UnitTests/WebsiteFetcherServiceTests.cs`:

```csharp
using System.Net;
using System.Text;
using LocaleBoost.Api.Services;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class WebsiteFetcherServiceTests
{
    private class FakeHandler : HttpMessageHandler
    {
        private readonly string _content;
        public FakeHandler(string content) => _content = content;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_content, Encoding.UTF8, "text/html")
            };
            return Task.FromResult(response);
        }
    }

    private class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            throw new HttpRequestException("Connection reset by peer");
        }
    }

    private class ErrorStatusHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("not found", Encoding.UTF8, "text/plain")
            });
        }
    }

    [Fact]
    public async Task FetchHtmlAsync_ReturnsContent_WhenUnderTheSizeLimit()
    {
        var httpClient = new HttpClient(new FakeHandler("<html><body>Hello</body></html>"));
        var service = new WebsiteFetcherService(httpClient);

        var result = await service.FetchHtmlAsync("https://example.com");

        Assert.Equal("<html><body>Hello</body></html>", result);
    }

    [Fact]
    public async Task FetchHtmlAsync_TruncatesContent_WhenOverTheSizeLimit()
    {
        var longContent = new string('a', 60_000);
        var httpClient = new HttpClient(new FakeHandler(longContent));
        var service = new WebsiteFetcherService(httpClient);

        var result = await service.FetchHtmlAsync("https://example.com");

        Assert.Equal(50_000, result.Length);
    }

    [Fact]
    public async Task FetchHtmlAsync_WhenHttpRequestExceptionThrown_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ThrowingHandler());
        var service = new WebsiteFetcherService(httpClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.FetchHtmlAsync("https://example.com"));

        Assert.Equal("No se pudo acceder al sitio web actual, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }

    [Fact]
    public async Task FetchHtmlAsync_WhenUpstreamReturnsErrorStatus_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler());
        var service = new WebsiteFetcherService(httpClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.FetchHtmlAsync("https://example.com"));

        Assert.Equal("No se pudo acceder al sitio web actual, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~WebsiteFetcherServiceTests"`
Expected: FAIL — build error, `WebsiteFetcherService`/`IWebsiteFetcherService` don't exist yet.

- [ ] **Step 3: Write `IWebsiteFetcherService.cs`**

```csharp
namespace LocaleBoost.Api.Services;

public interface IWebsiteFetcherService
{
    Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 4: Write `WebsiteFetcherService.cs`**

```csharp
namespace LocaleBoost.Api.Services;

public class WebsiteFetcherService : IWebsiteFetcherService
{
    private const int MaxContentLength = 50_000;
    private readonly HttpClient _httpClient;

    public WebsiteFetcherService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default)
    {
        string content;
        try
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            content = await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ExternalServiceException("No se pudo acceder al sitio web actual, intentá de nuevo.", ex);
        }

        return content.Length > MaxContentLength ? content[..MaxContentLength] : content;
    }
}
```

- [ ] **Step 5: Register the typed `HttpClient` in `Program.cs`**

In `backend/LocaleBoost.Api/Program.cs`, immediately after the existing `builder.Services.AddHttpClient<IGoogleMapsService, GoogleMapsService>(...)` block, add:

```csharp
builder.Services.AddHttpClient<IWebsiteFetcherService, WebsiteFetcherService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

(No `BaseAddress` — unlike `GoogleMapsService`, this client calls whatever absolute URL is passed to `FetchHtmlAsync`, since it fetches arbitrary third-party business sites, not one fixed API.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~WebsiteFetcherServiceTests"`
Expected: PASS

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all tests PASS — 30 existing plus 4 new = 34.

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Services/IWebsiteFetcherService.cs backend/LocaleBoost.Api/Services/WebsiteFetcherService.cs backend/LocaleBoost.Api.Tests/UnitTests/WebsiteFetcherServiceTests.cs backend/LocaleBoost.Api/Program.cs
git commit -m "feat(backend): add WebsiteFetcherService to fetch an existing site's HTML"
```

---

### Task 8: `ClaudeService` — audit an existing site and propose an improved one

**Files:**
- Modify: `backend/LocaleBoost.Api/Services/IClaudeService.cs`
- Modify: `backend/LocaleBoost.Api/Services/ClaudeService.cs`
- Modify: `backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs` (just the shared `FakeClaudeService`, to keep it compiling against the extended interface)

**Interfaces:**
- Consumes: `AnthropicClient`, `ExternalServiceException` (existing).
- Produces: `WebsiteAuditResult(string AuditSummary, string ProposedHtml)` and `IClaudeService.AuditAndProposeWebsiteAsync(string businessName, string address, string? phone, string existingSiteHtml, CancellationToken cancellationToken = default) : Task<WebsiteAuditResult>` — Task 9 (`WebsitesController`) calls this. `FakeClaudeService.AuditAndProposeWebsiteAsync` returns `new WebsiteAuditResult("Fake audit report", "<html>Improved</html>")` — Task 9's test asserts against these exact literal values.

- [ ] **Step 1: Write the failing test**

In `backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs`, add:

```csharp
    [Fact]
    public async Task AuditAndProposeWebsiteAsync_ReturnsParsedAuditAndHtml()
    {
        var claudeResponseJson = "{\"content\": [{\"type\": \"text\", \"text\": \"{\\\"audit\\\": \\\"Le falta meta descripci\\u00f3n.\\\", \\\"html\\\": \\\"<html>Mejorado</html>\\\"}\"}]}";

        var httpClient = new HttpClient(new FakeHandler(claudeResponseJson))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var result = await service.AuditAndProposeWebsiteAsync(
            "Test Cafe", "Main St 1", "111", "<html><body>Old site</body></html>");

        Assert.Equal("Le falta meta descripción.", result.AuditSummary);
        Assert.Equal("<html>Mejorado</html>", result.ProposedHtml);
    }

    [Fact]
    public async Task AuditAndProposeWebsiteAsync_WhenResponseIsNotValidJson_ThrowsExternalServiceException()
    {
        var claudeResponseJson = "{\"content\": [{\"type\": \"text\", \"text\": \"not json at all\"}]}";

        var httpClient = new HttpClient(new FakeHandler(claudeResponseJson))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.AuditAndProposeWebsiteAsync("Test Cafe", "Main St 1", "111", "<html></html>"));

        Assert.Equal("No se pudo generar la auditoría, intentá de nuevo.", ex.Message);
    }

    [Fact]
    public async Task AuditAndProposeWebsiteAsync_WhenAnthropicApiFails_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler())
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.AuditAndProposeWebsiteAsync("Test Cafe", "Main St 1", "111", "<html></html>"));

        Assert.Equal("No se pudo generar la auditoría, intentá de nuevo.", ex.Message);
        Assert.IsAssignableFrom<AnthropicException>(ex.InnerException);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~ClaudeServiceTests"`
Expected: FAIL — build error, `AuditAndProposeWebsiteAsync`/`WebsiteAuditResult` don't exist yet.

- [ ] **Step 3: Update `IClaudeService.cs`**

```csharp
namespace LocaleBoost.Api.Services;

public record WebsiteAuditResult(string AuditSummary, string ProposedHtml);

public interface IClaudeService
{
    Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default);

    Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
        string businessName, string address, string? phone, string existingSiteHtml,
        CancellationToken cancellationToken = default);
}
```

- [ ] **Step 4: Implement `AuditAndProposeWebsiteAsync` in `ClaudeService.cs`**

Add `using System.Text.Json;` and `using System.Text.Json.Serialization;` to the top of the file, then add the new method and its private helpers (after the existing `GenerateWebsiteHtmlAsync`, before the closing brace of the class):

```csharp
    public async Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
        string businessName, string address, string? phone, string existingSiteHtml,
        CancellationToken cancellationToken = default)
    {
        var prompt =
            "Sos un consultor de marketing digital. Te paso el HTML actual del sitio web de un negocio local " +
            "y sus datos. Necesito dos cosas, en castellano:\n\n" +
            "1. Una auditoría breve (4-8 puntos) de lo que se podría mejorar: SEO (títulos, meta descripción, " +
            "encabezados, contenido), diseño/usabilidad, adaptación a celular, y velocidad/estructura del " +
            "código si es evidente del HTML.\n" +
            "2. Una propuesta de sitio HTML mejorado, autocontenido en un solo archivo, que corrija esos puntos.\n\n" +
            $"Negocio: {businessName}. Dirección: {address}. Teléfono: {phone ?? "no disponible"}.\n\n" +
            $"HTML actual del sitio:\n{existingSiteHtml}\n\n" +
            "Respondé ÚNICAMENTE con un JSON válido de esta forma, sin texto antes ni después:\n" +
            "{\"audit\": \"<auditoría en texto plano, con saltos de línea entre puntos>\", " +
            "\"html\": \"<HTML completo de la propuesta>\"}";

        string rawText;
        try
        {
            var response = await _client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeOpus4_8,
                MaxTokens = 16000,
                Messages = [new() { Role = Role.User, Content = prompt }],
            }, cancellationToken);

            rawText = response.Content
                .Select(b => b.Value)
                .OfType<TextBlock>()
                .FirstOrDefault()?.Text ?? string.Empty;
        }
        catch (AnthropicException ex)
        {
            throw new ExternalServiceException("No se pudo generar la auditoría, intentá de nuevo.", ex);
        }

        try
        {
            return ParseAuditResponse(rawText);
        }
        catch (JsonException ex)
        {
            throw new ExternalServiceException("No se pudo generar la auditoría, intentá de nuevo.", ex);
        }
    }

    private static WebsiteAuditResult ParseAuditResponse(string rawResponse)
    {
        var trimmed = rawResponse.Trim();
        if (trimmed.StartsWith("```"))
        {
            var firstNewline = trimmed.IndexOf('\n');
            var lastFence = trimmed.LastIndexOf("```");
            if (firstNewline >= 0 && lastFence > firstNewline)
            {
                trimmed = trimmed[(firstNewline + 1)..lastFence].Trim();
            }
        }

        var parsed = JsonSerializer.Deserialize<AuditJsonPayload>(trimmed)
            ?? throw new JsonException("Empty audit response");

        return new WebsiteAuditResult(parsed.Audit, parsed.Html);
    }

    private class AuditJsonPayload
    {
        [JsonPropertyName("audit")]
        public string Audit { get; set; } = string.Empty;

        [JsonPropertyName("html")]
        public string Html { get; set; } = string.Empty;
    }
```

- [ ] **Step 5: Keep `FakeClaudeService` (in `WebsitesControllerTests.cs`) compiling**

In `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs`, change:

```csharp
public class FakeClaudeService : IClaudeService
{
    public Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default)
    {
        return Task.FromResult($"<html>{businessName}</html>");
    }
}
```

to:

```csharp
public class FakeClaudeService : IClaudeService
{
    public Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default)
    {
        return Task.FromResult($"<html>{businessName}</html>");
    }

    public Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
        string businessName, string address, string? phone, string existingSiteHtml,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebsiteAuditResult("Fake audit report", "<html>Improved</html>"));
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~ClaudeServiceTests"`
Expected: PASS

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all tests PASS — 34 existing plus 3 new = 37.

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Services/IClaudeService.cs backend/LocaleBoost.Api/Services/ClaudeService.cs backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs
git commit -m "feat(backend): add ClaudeService.AuditAndProposeWebsiteAsync for existing-site audits"
```

---

### Task 9: `WebsitesController` — branch generate-vs-audit, expose audit fields in the DTO

**Files:**
- Modify: `backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/WebsitesController.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs`

**Interfaces:**
- Consumes: `BusinessSearchResult.WebsiteUrl` (Task 3), `IWebsiteFetcherService.FetchHtmlAsync` (Task 7), `IClaudeService.AuditAndProposeWebsiteAsync`/`WebsiteAuditResult` (Task 8), the two-result `FakeGoogleMapsService` with `includeWithWebsite=true` (Task 4).
- Produces: `GeneratedWebsiteDto` with `AuditSummary`/`SourceWebsiteUrl` — Task 10 (frontend model) depends on this exact shape.

- [ ] **Step 1: Write the failing test**

In `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs`, add a `FakeWebsiteFetcherService` and register it alongside the other two fakes:

```csharp
public class FakeWebsiteFetcherService : IWebsiteFetcherService
{
    public Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default)
    {
        return Task.FromResult("<html><body>Old site</body></html>");
    }
}
```

Update the constructor's `ConfigureServices` block to also swap in the fetcher fake:

```csharp
    public WebsitesControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var mapsDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IGoogleMapsService));
                if (mapsDescriptor is not null) services.Remove(mapsDescriptor);
                services.AddScoped<IGoogleMapsService, FakeGoogleMapsService>();

                var claudeDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IClaudeService));
                if (claudeDescriptor is not null) services.Remove(claudeDescriptor);
                services.AddScoped<IClaudeService, FakeClaudeService>();

                var fetcherDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IWebsiteFetcherService));
                if (fetcherDescriptor is not null) services.Remove(fetcherDescriptor);
                services.AddScoped<IWebsiteFetcherService, FakeWebsiteFetcherService>();
            });
        });
    }
```

Add a new test:

```csharp
    [Fact]
    public async Task Generate_ForResultWithExistingWebsite_ReturnsAuditAndProposedHtml()
    {
        var client = await CreateAuthenticatedClientAsync();
        var searchResponse = await client.GetAsync("/api/businesses/search?query=cafes&includeWithWebsite=true");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        var resultWithWebsite = search!.Results.Single(r => r.HasWebsite);

        var response = await client.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(resultWithWebsite.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GeneratedWebsiteDto>();
        Assert.Equal("<html>Improved</html>", body!.GeneratedContent);
        Assert.Equal("Fake audit report", body.AuditSummary);
        Assert.Equal(resultWithWebsite.WebsiteUrl, body.SourceWebsiteUrl);
    }
```

Add `using System.Linq;` to the top of the file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~WebsitesControllerTests"`
Expected: FAIL — build error (`GeneratedWebsiteDto` has no `AuditSummary`/`SourceWebsiteUrl` yet) or, once stubbed, the new test fails because `Generate` always calls the plain-generation path.

- [ ] **Step 3: Add the fields to `GeneratedWebsiteDto`**

`backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs`:

```csharp
namespace LocaleBoost.Api.Dtos.Websites;

public record GenerateWebsiteRequest(Guid BusinessSearchResultId);

public record GeneratedWebsiteDto(
    Guid Id, string BusinessName, string BusinessAddress, string? BusinessPhone,
    string GeneratedContent, string? AuditSummary, string? SourceWebsiteUrl, DateTime CreatedAt);
```

- [ ] **Step 4: Branch `WebsitesController.Generate` on `WebsiteUrl`**

Update the constructor and the `Generate`/`GetAll` actions in `backend/LocaleBoost.Api/Controllers/WebsitesController.cs`:

```csharp
    private readonly IClaudeService _claude;
    private readonly IWebsiteFetcherService _websiteFetcher;
    private readonly AppDbContext _db;

    public WebsitesController(IClaudeService claude, IWebsiteFetcherService websiteFetcher, AppDbContext db)
    {
        _claude = claude;
        _websiteFetcher = websiteFetcher;
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpPost("generate")]
    public async Task<ActionResult<GeneratedWebsiteDto>> Generate(GenerateWebsiteRequest request)
    {
        var result = await _db.BusinessSearchResults
            .Join(_db.BusinessSearches,
                r => r.BusinessSearchId,
                s => s.Id,
                (r, s) => new { Result = r, Search = s })
            .Where(x => x.Result.Id == request.BusinessSearchResultId && x.Search.UserId == CurrentUserId)
            .Select(x => x.Result)
            .SingleOrDefaultAsync();

        if (result is null)
        {
            return NotFound();
        }

        string generatedContent;
        string? auditSummary = null;
        string? sourceWebsiteUrl = null;

        if (!string.IsNullOrWhiteSpace(result.WebsiteUrl))
        {
            var existingHtml = await _websiteFetcher.FetchHtmlAsync(result.WebsiteUrl);
            var audit = await _claude.AuditAndProposeWebsiteAsync(result.Name, result.Address, result.Phone, existingHtml);
            generatedContent = audit.ProposedHtml;
            auditSummary = audit.AuditSummary;
            sourceWebsiteUrl = result.WebsiteUrl;
        }
        else
        {
            generatedContent = await _claude.GenerateWebsiteHtmlAsync(result.Name, result.Address, result.Phone);
        }

        var website = new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            BusinessName = result.Name,
            BusinessAddress = result.Address,
            BusinessPhone = result.Phone,
            GeneratedContent = generatedContent,
            AuditSummary = auditSummary,
            SourceWebsiteUrl = sourceWebsiteUrl,
            CreatedAt = DateTime.UtcNow
        };

        _db.GeneratedWebsites.Add(website);
        await _db.SaveChangesAsync();

        return Ok(new GeneratedWebsiteDto(
            website.Id, website.BusinessName, website.BusinessAddress,
            website.BusinessPhone, website.GeneratedContent, website.AuditSummary, website.SourceWebsiteUrl,
            website.CreatedAt));
    }

    [HttpGet]
    public async Task<ActionResult<List<GeneratedWebsiteDto>>> GetAll()
    {
        var websites = await _db.GeneratedWebsites
            .Where(w => w.UserId == CurrentUserId)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new GeneratedWebsiteDto(
                w.Id, w.BusinessName, w.BusinessAddress, w.BusinessPhone,
                w.GeneratedContent, w.AuditSummary, w.SourceWebsiteUrl, w.CreatedAt))
            .ToListAsync();

        return Ok(websites);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && dotnet test --filter "FullyQualifiedName~WebsitesControllerTests"`
Expected: PASS — including the pre-existing `Generate_ForOwnSearchResult_CreatesAndReturnsWebsite` test, which searches without `includeWithWebsite=true` and so still only gets the no-website result, taking the plain-generation branch exactly as before.

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && dotnet test`
Expected: all tests PASS — 37 existing plus 1 new = 38.

- [ ] **Step 7: Commit**

```bash
git add backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs backend/LocaleBoost.Api/Controllers/WebsitesController.cs backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs
git commit -m "feat(backend): audit existing sites and propose improvements instead of generating from scratch"
```

---

### Task 10: Frontend — show the audit report, branch the generate button's label

**Files:**
- Modify: `frontend/src/app/core/models/website.models.ts`
- Modify: `frontend/src/app/features/generated-websites/generated-websites.html`
- Modify: `frontend/src/app/features/generated-websites/generated-websites.service.spec.ts`
- Modify: `frontend/src/app/features/generated-websites/generated-websites.spec.ts`
- Modify: `frontend/src/app/features/business-search/business-search.html`

**Interfaces:**
- Consumes: `GeneratedWebsiteDto` shape from Task 9 (`auditSummary: string | null`, `sourceWebsiteUrl: string | null`), `BusinessSearchResult.hasWebsite` from Task 5.
- Produces: nothing new for later tasks — this is the last task in the plan.

- [ ] **Step 1: Write the failing test**

In `frontend/src/app/features/generated-websites/generated-websites.service.spec.ts`, add `auditSummary` and `sourceWebsiteUrl` to both flushed fixtures:

```typescript
    req.flush([
      {
        id: 'w1',
        businessName: 'Acme Plumbing',
        businessAddress: '1 Main St',
        businessPhone: null,
        generatedContent: '<html></html>',
        auditSummary: null,
        sourceWebsiteUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
```

and:

```typescript
    req.flush({
      id: 'w2',
      businessName: 'New Biz',
      businessAddress: '2 Side St',
      businessPhone: null,
      generatedContent: '<html></html>',
      auditSummary: null,
      sourceWebsiteUrl: null,
      createdAt: '2026-01-02T00:00:00Z',
    });
```

In `frontend/src/app/features/generated-websites/generated-websites.spec.ts`, add the two fields to `sampleWebsite`:

```typescript
  const sampleWebsite: GeneratedWebsite = {
    id: 'w1',
    businessName: 'Acme Plumbing',
    businessAddress: '1 Main St',
    businessPhone: null,
    generatedContent: '<html><body>Hi</body></html>',
    auditSummary: null,
    sourceWebsiteUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --watch=false`
Expected: FAIL — `GeneratedWebsite` doesn't have `auditSummary`/`sourceWebsiteUrl` yet, so the fixtures don't satisfy the type.

- [ ] **Step 3: Update the model**

`frontend/src/app/core/models/website.models.ts`:

```typescript
export interface GenerateWebsiteRequest {
  businessSearchResultId: string;
}

export interface GeneratedWebsite {
  id: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string | null;
  generatedContent: string;
  auditSummary: string | null;
  sourceWebsiteUrl: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Update `generated-websites.html`**

Replace:

```html
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ website.businessName }}</p>
          <p class="text-sm text-slate-600">{{ website.businessAddress }}</p>
          <p class="text-xs text-slate-400">{{ website.createdAt | date: 'medium' }}</p>
          <button
            type="button"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white"
            (click)="preview(website)"
          >
            Vista previa
          </button>
        </li>
```

with:

```html
        <li class="rounded border border-slate-200 p-4">
          <p class="font-medium">{{ website.businessName }}</p>
          <p class="text-sm text-slate-600">{{ website.businessAddress }}</p>
          <p class="text-xs text-slate-400">{{ website.createdAt | date: 'medium' }}</p>
          @if (website.auditSummary) {
            <div class="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
              <p class="mb-1 font-medium">Informe de auditoría</p>
              <p style="white-space: pre-line">{{ website.auditSummary }}</p>
              @if (website.sourceWebsiteUrl) {
                <p class="mt-1 text-xs text-amber-700">Basado en: {{ website.sourceWebsiteUrl }}</p>
              }
            </div>
          }
          <button
            type="button"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white"
            (click)="preview(website)"
          >
            Vista previa
          </button>
        </li>
```

(`(website.createdAt | date: 'medium')` already renders with the browser's locale-independent Angular date pipe — no change needed there.)

- [ ] **Step 6: Update `business-search.html`'s generate button label**

Replace:

```html
          <button
            type="button"
            [disabled]="generatingResultId() === result.id"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            (click)="onGenerate(result)"
          >
            {{ generatingResultId() === result.id ? 'Generando…' : 'Generar sitio web' }}
          </button>
```

with:

```html
          <button
            type="button"
            [disabled]="generatingResultId() === result.id"
            class="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            (click)="onGenerate(result)"
          >
            @if (generatingResultId() === result.id) {
              {{ result.hasWebsite ? 'Auditando…' : 'Generando…' }}
            } @else {
              {{ result.hasWebsite ? 'Auditar y mejorar' : 'Generar sitio web' }}
            }
          </button>
```

- [ ] **Step 7: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --watch=false`
Expected: all tests PASS.

Run: `cd frontend && npm run build`
Expected: builds cleanly.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/models/website.models.ts frontend/src/app/features/generated-websites/generated-websites.html frontend/src/app/features/generated-websites/generated-websites.service.spec.ts frontend/src/app/features/generated-websites/generated-websites.spec.ts frontend/src/app/features/business-search/business-search.html
git commit -m "feat(frontend): show audit report for existing sites, branch generate button label"
```
