# Pantalla de Facturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Facturas screen (list with filters, manual creation, read-only detail, marcar cobrada, anular, rectificar) in the Angular frontend, add the backend support it needs (`POST /api/facturas` for manual creation, a `FechaCobro` persistence fix, `PresupuestoSummaryDto.FacturaId`), and wire the "convertir a factura" button into the existing Presupuestos screen.

**Architecture:** Backend gets three additive changes to `FacturasController`/`PresupuestosController` — no breaking changes to existing endpoints, no `PUT`/`DELETE` added (Factura stays immutable). Frontend follows the same layered pattern as Presupuestos: a `FacturasService` holding signal state (with a private "last cliente filter" so mutations reload without dropping the active filter) plus a non-state `getById()`, four satellite `<dialog>` components (`FacturaFormModal`, `FacturaDetalleModal`, `MarcarCobradaModal`, `RectificarModal`), and a `Facturas` list component with client-side estado/número filters plus a backend-backed cliente filter. `Presupuestos` gains a `ConvertirAFacturaModal` and a button wired to the existing (until now unused by the frontend) `convertir-a-factura` endpoint.

**Tech Stack:** .NET 8, EF Core, Npgsql 8.0.4, xUnit + Testcontainers (backend); Angular 22 standalone components, signals, `computed()`, `output()`, `FormsModule`/`ngModel`, Tailwind, Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-08-05-pantalla-facturas-design.md`

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill (`feature/pantalla-facturas`) at execution time.

## Global Constraints

- Follow existing project conventions exactly: standalone components, one folder per feature under `src/app/features/`, `.ts` + `.html` + `.css` + `.spec.ts` split into separate files (never inline templates/styles).
- State lives in signals inside an injectable service (`@Service()` — this project's alias for `@Injectable()`), exposed as `readonly` to components.
- HTTP calls use `HttpClient` + `firstValueFrom` (no `.subscribe()`), except in tests where `output()` values ARE read via `.subscribe()` (see existing `presupuesto-form-modal.spec.ts`).
- Errors are formatted with the existing `extractErrorMessage()` from `core/http-error.util.ts` — do not modify that file.
- Forms use `FormsModule` + `[ngModel]`/`(ngModelChange)`, never Reactive Forms. Use `[ngValue]` (not `[value]`) on `<option>` elements bound to non-string data.
- Tailwind utility classes inline in templates; no new CSS framework or component library; no new npm/NuGet dependencies.
- New routes nest under the existing `Layout` component, guarded by `authGuard`, inside `app.routes.ts`.
- Component outputs use `output()` (`readonly saved = output<void>();`), not `@Output() = new EventEmitter()`.
- List components inject and expose the whole service to the template (`protected readonly facturasService = inject(FacturasService);`), not individual signals.
- **Backend enums serialize as numbers.** No `JsonStringEnumConverter` anywhere in the backend. TypeScript numeric enums must match `backend/LocaleBoost.Api/Data/Entities/FacturacionEnums.cs` member order exactly:
  ```csharp
  public enum TipoLinea { ServicioPorHoras, ServicioPrecioFijo, Suscripcion, Producto }
  public enum TipoIva { General21, Reducido10, Superreducido4, Exento }
  public enum EstadoFactura { Emitida, Cobrada, Anulada, Rectificada }
  ```
- Angular emits `null` (not `NaN`) when a `type="number"` input is cleared, and `tsconfig.json` has no `strict`/`strictTemplates`. Apply explicit `Number(...)` coercion + range validation in `onSubmit()` for every numeric field from the start.
- **jsdom does not implement `HTMLDialogElement.showModal()`/`close()`.** Every dialog component exposes its `ElementRef` as a non-`private` `@ViewChild` so tests can stub it with `{ nativeElement: { showModal: vi.fn(), close: vi.fn() } }`.
- Component tests construct via `TestBed.createComponent(X).componentInstance` and assign `@ViewChild` references / stub services by hand — no `fixture.detectChanges()` except where explicitly rendering the DOM tree.
- **Dates travel as UTC instants**, never bare dates: `fecha ? \`${fecha}T00:00:00Z\` : null` for every date field sent to the backend (`fechaVencimiento`, `fechaCobro`). The `Facturas`/`Series` tables are `timestamptz` via Npgsql 8.0.4 — a `DateTime` with `Kind=Unspecified` gets rejected with a 500 (this bit Presupuestos' `fechaValidez` in commit `08249a6`).
- **`Factura` is immutable.** No `PUT`/`DELETE /api/facturas/{id}` exists or gets added. `FacturaFormModal` is create-only (no edit mode, unlike `PresupuestoFormModal`).
- **Reuse `LineaPresupuestoRequest`** (from `presupuesto.models.ts`) for factura line requests (`CreateFacturaRequest.lineas`, `RectificarFacturaRequest.lineasCorregidas`) instead of introducing a redundant `LineaFacturaRequest` type — this mirrors the backend, which already reuses the C# `LineaPresupuestoRequest` record for `RectificarFacturaRequest.LineasCorregidas` and will do the same for the new `CreateFacturaRequest.Lineas` (Task 2). Likewise reuse `TipoLinea`, `TipoIva`, `TIPO_LINEA_LABELS`, `TIPO_IVA_LABELS`, `TIPO_IVA_PORCENTAJE` from `presupuesto.models.ts` — do not duplicate them into `factura.models.ts`.
- **`FacturasService.load(clienteId?)` remembers the last-used `clienteId`** in a private field, and every mutation (`create`, `marcarCobrada`, `anular`, `rectificar`) reloads through that remembered filter rather than calling `load()` bare — otherwise marking a factura as cobrada while the list is filtered by cliente would silently reset the filter.
- The "Anular" button IS exposed in this iteration (see spec's "Fuera de alcance" section) — the user made this call explicitly despite `CONTINUAR-MODULO-FACTURACION.md`'s earlier caution to wait for fiscal-advisor confirmation. Do not second-guess this in implementation.
- Backend: every new/changed endpoint stays scoped to `CurrentUserId`, matching all existing controller actions.
- Backend tests use `IClassFixture<CustomWebApplicationFactory>` (Testcontainers-backed Postgres, migrations auto-applied via `MigrateAsync()` in the factory — no manual `dotnet ef database update` needed for tests to see a new migration).
- Run backend tests from `backend/` with `dotnet test` (baseline **44 tests pass** before this plan's changes). Run frontend tests from `frontend/` with `npm test` (baseline **23 files / 140 tests pass**).
- Out of scope (see spec): PDF generation, edition/deletion of facturas, Verifactu hash chaining, any change to the anular-vs-rectificar fiscal criteria beyond what's already decided above.

---

### Task 1: Backend — `FechaCobro` persistence fix

**Files:**
- Modify: `backend/LocaleBoost.Api/Data/Entities/Factura.cs`
- Modify: `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/FacturasController.cs`
- Create: EF Core migration (via `dotnet ef migrations add`)
- Create: `backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs`

**Interfaces:**
- Consumes: existing `PresupuestosController` (`POST /api/presupuestos`, `POST /api/presupuestos/{id}/estado`, `POST /api/presupuestos/{id}/convertir-a-factura`), existing `SeriesController` (`POST /api/series`), existing `ClientesController` (`POST /api/clientes`) — used only to construct a Factura for the test, since `POST /api/facturas` doesn't exist until Task 2.
- Produces (used by Task 2 and all frontend tasks): `Factura.FechaCobro` (`DateTime?`), `FacturaDto` with a `FechaCobro` field in the same position as the entity, `FacturasControllerTests.cs` with reusable private helpers `CreateAuthenticatedClientAsync()`, `CreateClienteAsync(HttpClient)`, `CreateSerieAsync(HttpClient, bool esRectificativa = false)`, `CreateFacturaViaConversionAsync(HttpClient, Guid clienteId, Guid serieId)`.

- [ ] **Step 1: Write the failing integration test**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Clientes;
using LocaleBoost.Api.Dtos.Facturas;
using LocaleBoost.Api.Dtos.Presupuestos;
using LocaleBoost.Api.Dtos.Series;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class FacturasControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

    public FacturasControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var code = Guid.NewGuid().ToString("N");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.InviteCodes.Add(new InviteCode
            {
                Id = Guid.NewGuid(),
                Code = code,
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private async Task<Guid> CreateClienteAsync(HttpClient client)
    {
        var request = new CreateClienteRequest(
            "Cliente de prueba", "12345678Z", "Calle Falsa 123", "28080", "Madrid", "Madrid",
            "España", "cliente@test.com", "600000000", false);

        var response = await client.PostAsJsonAsync("/api/clientes", request);
        response.EnsureSuccessStatusCode();
        var cliente = await response.Content.ReadFromJsonAsync<ClienteDto>();
        return cliente!.Id;
    }

    private async Task<Guid> CreateSerieAsync(HttpClient client, bool esRectificativa = false)
    {
        var request = new CreateSerieRequest($"F{Guid.NewGuid().ToString("N")[..4]}", null, 2026, esRectificativa);
        var response = await client.PostAsJsonAsync("/api/series", request);
        response.EnsureSuccessStatusCode();
        var serie = await response.Content.ReadFromJsonAsync<SerieDto>();
        return serie!.Id;
    }

    private async Task<FacturaDto> CreateFacturaViaConversionAsync(HttpClient client, Guid clienteId, Guid serieId)
    {
        var createPresupuesto = new CreatePresupuestoRequest(
            clienteId, $"PRE-{Guid.NewGuid().ToString("N")[..6]}", null, null,
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Línea de prueba", 2m, 100m, TipoIva.General21, 0)
            });

        var createResponse = await client.PostAsJsonAsync("/api/presupuestos", createPresupuesto);
        createResponse.EnsureSuccessStatusCode();
        var presupuesto = await createResponse.Content.ReadFromJsonAsync<PresupuestoDto>();

        var estadoResponse = await client.PostAsJsonAsync(
            $"/api/presupuestos/{presupuesto!.Id}/estado",
            new CambiarEstadoPresupuestoRequest(EstadoPresupuesto.Aceptado));
        estadoResponse.EnsureSuccessStatusCode();

        var convertirResponse = await client.PostAsJsonAsync(
            $"/api/presupuestos/{presupuesto.Id}/convertir-a-factura",
            new ConvertirAFacturaRequest(serieId, null));
        convertirResponse.EnsureSuccessStatusCode();
        var factura = await convertirResponse.Content.ReadFromJsonAsync<FacturaDto>();
        return factura!;
    }

    [Fact]
    public async Task MarcarCobrada_PersistsFechaCobro()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);
        var serieId = await CreateSerieAsync(client);
        var factura = await CreateFacturaViaConversionAsync(client, clienteId, serieId);

        var fechaCobro = new DateTime(2026, 8, 15, 0, 0, 0, DateTimeKind.Utc);
        var response = await client.PostAsJsonAsync(
            $"/api/facturas/{factura.Id}/marcar-cobrada",
            new MarcarCobradaRequest(fechaCobro));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(
            response.StatusCode == HttpStatusCode.OK,
            $"Expected 200 OK but got {(int)response.StatusCode} {response.StatusCode}. Body: {body}");

        var updated = await response.Content.ReadFromJsonAsync<FacturaDto>();
        Assert.NotNull(updated);
        Assert.Equal(EstadoFactura.Cobrada, updated!.Estado);
        Assert.Equal(fechaCobro, updated.FechaCobro);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await db.Facturas.SingleAsync(f => f.Id == factura.Id);
        Assert.Equal(fechaCobro, persisted.FechaCobro);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && dotnet test --filter FacturasControllerTests`
Expected: build FAILS — `FacturaDto` has no `FechaCobro` member yet (`updated.FechaCobro` and `persisted.FechaCobro` don't compile).

- [ ] **Step 3: Add `FechaCobro` to the entity**

In `backend/LocaleBoost.Api/Data/Entities/Factura.cs`, add after `FechaVencimiento`:

```csharp
    public DateTime? FechaVencimiento { get; set; }
    public DateTime? FechaCobro { get; set; }
```

- [ ] **Step 4: Generate the migration**

Run:
```bash
cd backend/LocaleBoost.Api
dotnet ef migrations add AddFacturaFechaCobro
```
Expected: a new file `Migrations/<timestamp>_AddFacturaFechaCobro.cs` adding a nullable `timestamptz` column `FechaCobro` to the `Facturas` table.

- [ ] **Step 5: Add `FechaCobro` to `FacturaDto` and its mapping**

In `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`, update `FacturaDto` and `ToDto()`:

```csharp
public record FacturaDto(
    Guid Id,
    Guid ClienteId,
    Guid SerieId,
    string NumeroCompleto,
    EstadoFactura Estado,
    DateTime FechaEmision,
    DateTime? FechaVencimiento,
    DateTime? FechaCobro,
    decimal? PorcentajeRetencionIrpf,
    decimal BaseImponible,
    decimal TotalIva,
    decimal TotalRetencion,
    decimal Total,
    Guid? PresupuestoOrigenId,
    Guid? FacturaRectificadaId,
    string? PdfUrl,
    List<LineaFacturaDto> Lineas,
    DateTime CreatedAt);
```

```csharp
    public static FacturaDto ToDto(this Factura f) => new(
        f.Id, f.ClienteId, f.SerieId, f.NumeroCompleto, f.Estado, f.FechaEmision, f.FechaVencimiento, f.FechaCobro,
        f.PorcentajeRetencionIrpf, f.BaseImponible, f.TotalIva, f.TotalRetencion, f.Total,
        f.PresupuestoOrigenId, f.FacturaRectificadaId, f.PdfUrl,
        f.Lineas.OrderBy(l => l.Orden)
            .Select(l => new LineaFacturaDto(l.Id, l.Tipo, l.Descripcion, l.Cantidad, l.PrecioUnitario, l.TipoIva, l.Orden))
            .ToList(),
        f.CreatedAt);
```

- [ ] **Step 6: Persist `FechaCobro` in `MarcarCobrada`**

In `backend/LocaleBoost.Api/Controllers/FacturasController.cs`, update the `MarcarCobrada` action body:

```csharp
        factura.Estado = EstadoFactura.Cobrada;
        factura.FechaCobro = request.FechaCobro;
        await _db.SaveChangesAsync();
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && dotnet test --filter FacturasControllerTests`
Expected: PASS (1 test).

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && dotnet test`
Expected: 45 passed (44 baseline + 1 new).

- [ ] **Step 9: Commit**

```bash
git add backend/LocaleBoost.Api/Data/Entities/Factura.cs \
        backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs \
        backend/LocaleBoost.Api/Controllers/FacturasController.cs \
        backend/LocaleBoost.Api/Migrations/ \
        backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs
git commit -m "fix(facturas): persist FechaCobro on marcar-cobrada"
```

---

### Task 2: Backend — `POST /api/facturas` (alta manual)

**Files:**
- Modify: `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/FacturasController.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs`

**Interfaces:**
- Consumes: `CreateSerieAsync`, `CreateClienteAsync`, `CreateAuthenticatedClientAsync` from Task 1.
- Produces (used by frontend Task 4/5): `POST /api/facturas` accepting `CreateFacturaRequest(Guid ClienteId, Guid SerieId, DateTime? FechaVencimiento, decimal? PorcentajeRetencionIrpf, List<LineaPresupuestoRequest> Lineas)`, returning `201 Created` with `FacturaDto`; `400 BadRequest` for missing cliente, missing/rectificativa serie, or empty líneas.

- [ ] **Step 1: Write the failing tests**

Add to `backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs`:

```csharp
    [Fact]
    public async Task Create_WithValidRequest_ReturnsCreatedFacturaWithSequentialNumeroAndTotales()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);
        var serieId = await CreateSerieAsync(client);

        var request = new CreateFacturaRequest(
            clienteId, serieId, null, 10m,
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Consultoría", 4m, 100m, TipoIva.General21, 0),
                new(TipoLinea.Producto, "Licencia", 1m, 50m, TipoIva.Reducido10, 1)
            });

        var response = await client.PostAsJsonAsync("/api/facturas", request);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(
            response.StatusCode == HttpStatusCode.Created,
            $"Expected 201 Created but got {(int)response.StatusCode} {response.StatusCode}. Body: {body}");

        var factura = await response.Content.ReadFromJsonAsync<FacturaDto>();
        Assert.NotNull(factura);
        Assert.Equal(EstadoFactura.Emitida, factura!.Estado);
        Assert.EndsWith("-00001", factura.NumeroCompleto);
        Assert.Equal(450m, factura.BaseImponible);
        Assert.Equal(89m, factura.TotalIva);
        Assert.Equal(45m, factura.TotalRetencion);
        Assert.Equal(494m, factura.Total);
        Assert.Equal(2, factura.Lineas.Count);
    }

    [Fact]
    public async Task Create_WithNonexistentCliente_ReturnsBadRequest()
    {
        var client = await CreateAuthenticatedClientAsync();
        var serieId = await CreateSerieAsync(client);

        var request = new CreateFacturaRequest(
            Guid.NewGuid(), serieId, null, null,
            new List<LineaPresupuestoRequest> { new(TipoLinea.Producto, "Línea", 1m, 10m, TipoIva.General21, 0) });

        var response = await client.PostAsJsonAsync("/api/facturas", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithRectificativaSerie_ReturnsBadRequest()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);
        var serieRectificativaId = await CreateSerieAsync(client, esRectificativa: true);

        var request = new CreateFacturaRequest(
            clienteId, serieRectificativaId, null, null,
            new List<LineaPresupuestoRequest> { new(TipoLinea.Producto, "Línea", 1m, 10m, TipoIva.General21, 0) });

        var response = await client.PostAsJsonAsync("/api/facturas", request);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected 400 BadRequest but got {(int)response.StatusCode} {response.StatusCode}. Body: {body}");
    }

    [Fact]
    public async Task Create_WithNoLineas_ReturnsBadRequest()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);
        var serieId = await CreateSerieAsync(client);

        var request = new CreateFacturaRequest(clienteId, serieId, null, null, new List<LineaPresupuestoRequest>());

        var response = await client.PostAsJsonAsync("/api/facturas", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && dotnet test --filter FacturasControllerTests`
Expected: build FAILS — `CreateFacturaRequest` doesn't exist yet.

- [ ] **Step 3: Add `CreateFacturaRequest`**

In `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`, add near the other requests:

```csharp
public record CreateFacturaRequest(
    Guid ClienteId,
    Guid SerieId,
    DateTime? FechaVencimiento,
    decimal? PorcentajeRetencionIrpf,
    List<LineaPresupuestoRequest> Lineas);
```

- [ ] **Step 4: Add the `Create` action**

In `backend/LocaleBoost.Api/Controllers/FacturasController.cs`, add (e.g. right after the constructor, before `GetAll`):

```csharp
    [HttpPost]
    public async Task<ActionResult<FacturaDto>> Create(CreateFacturaRequest request)
    {
        var clienteExiste = await _db.Clientes.AnyAsync(c => c.Id == request.ClienteId && c.UserId == CurrentUserId);
        if (!clienteExiste)
        {
            return BadRequest(new { message = "El cliente indicado no existe." });
        }

        if (request.Lineas is null || request.Lineas.Count == 0)
        {
            return BadRequest(new { message = "La factura debe tener al menos una línea." });
        }

        var serie = await _db.Series.SingleOrDefaultAsync(s => s.Id == request.SerieId && s.UserId == CurrentUserId);
        if (serie is null)
        {
            return BadRequest(new { message = "La serie indicada no existe." });
        }
        if (serie.EsRectificativa)
        {
            return BadRequest(new { message = "No se puede usar una serie rectificativa para una factura normal." });
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();

        serie.UltimoNumero += 1;
        var numeroAsignado = serie.UltimoNumero;
        var numeroCompleto = $"{serie.Codigo}-{serie.Anio}-{numeroAsignado:D5}";

        var totales = _calculo.CalcularTotales(
            request.Lineas.Select(l => (l.Cantidad, l.PrecioUnitario, l.TipoIva)),
            request.PorcentajeRetencionIrpf);

        var ahora = DateTime.UtcNow;

        var factura = new Factura
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            ClienteId = request.ClienteId,
            SerieId = serie.Id,
            Numero = numeroAsignado,
            NumeroCompleto = numeroCompleto,
            Estado = EstadoFactura.Emitida,
            FechaEmision = ahora,
            FechaVencimiento = request.FechaVencimiento,
            PorcentajeRetencionIrpf = request.PorcentajeRetencionIrpf,
            BaseImponible = totales.BaseImponible,
            TotalIva = totales.TotalIva,
            TotalRetencion = totales.TotalRetencion,
            Total = totales.Total,
            CreatedAt = ahora,
            Lineas = request.Lineas.Select(l => new LineaFactura
            {
                Id = Guid.NewGuid(),
                Tipo = l.Tipo,
                Descripcion = l.Descripcion,
                Cantidad = l.Cantidad,
                PrecioUnitario = l.PrecioUnitario,
                TipoIva = l.TipoIva,
                Orden = l.Orden
            }).ToList()
        };

        _db.Facturas.Add(factura);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return CreatedAtAction(nameof(GetById), new { id = factura.Id }, factura.ToDto());
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && dotnet test --filter FacturasControllerTests`
Expected: PASS (5 tests: the 1 from Task 1 + these 4).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && dotnet test`
Expected: 49 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs \
        backend/LocaleBoost.Api/Controllers/FacturasController.cs \
        backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs
git commit -m "feat(facturas): add POST /api/facturas for manual creation"
```

---

### Task 3: Backend — expose `FacturaId` on `PresupuestoSummaryDto`

**Files:**
- Modify: `backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs`
- Modify: `backend/LocaleBoost.Api.Tests/IntegrationTests/PresupuestosControllerTests.cs`

**Interfaces:**
- Produces (used by frontend Task 11): `PresupuestoSummaryDto` gains a trailing `Guid? FacturaId` field.

- [ ] **Step 1: Write the failing test**

Add to `backend/LocaleBoost.Api.Tests/IntegrationTests/PresupuestosControllerTests.cs` (add `using LocaleBoost.Api.Dtos.Facturas;` and `using LocaleBoost.Api.Dtos.Series;` to the file's usings):

```csharp
    [Fact]
    public async Task GetAll_AfterConversion_IncludesFacturaIdInSummary()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);

        var createSerie = await client.PostAsJsonAsync("/api/series", new CreateSerieRequest("FAC", null, 2026, false));
        createSerie.EnsureSuccessStatusCode();
        var serie = await createSerie.Content.ReadFromJsonAsync<SerieDto>();

        var createRequest = new CreatePresupuestoRequest(
            clienteId, "PRE-CONV-001", null, null,
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Línea", 1m, 100m, TipoIva.General21, 0)
            });
        var createResponse = await client.PostAsJsonAsync("/api/presupuestos", createRequest);
        var presupuesto = await createResponse.Content.ReadFromJsonAsync<PresupuestoDto>();

        await client.PostAsJsonAsync($"/api/presupuestos/{presupuesto!.Id}/estado",
            new CambiarEstadoPresupuestoRequest(EstadoPresupuesto.Aceptado));

        var convertirResponse = await client.PostAsJsonAsync(
            $"/api/presupuestos/{presupuesto.Id}/convertir-a-factura",
            new ConvertirAFacturaRequest(serie!.Id, null));
        convertirResponse.EnsureSuccessStatusCode();
        var factura = await convertirResponse.Content.ReadFromJsonAsync<FacturaDto>();

        var listResponse = await client.GetAsync("/api/presupuestos");
        listResponse.EnsureSuccessStatusCode();
        var lista = await listResponse.Content.ReadFromJsonAsync<List<PresupuestoSummaryDto>>();

        var summary = lista!.Single(p => p.Id == presupuesto.Id);
        Assert.Equal(factura!.Id, summary.FacturaId);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && dotnet test --filter PresupuestosControllerTests`
Expected: build FAILS — `PresupuestoSummaryDto` has no `FacturaId` member.

- [ ] **Step 3: Add `FacturaId` to the DTO and mapping**

In `backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs`:

```csharp
public record PresupuestoSummaryDto(
    Guid Id, Guid ClienteId, string Numero, EstadoPresupuesto Estado, DateTime FechaEmision, int NumeroLineas, Guid? FacturaId);
```

```csharp
    public static PresupuestoSummaryDto ToSummaryDto(this Presupuesto p) => new(
        p.Id, p.ClienteId, p.Numero, p.Estado, p.FechaEmision, p.Lineas.Count, p.FacturaId);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && dotnet test --filter PresupuestosControllerTests`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && dotnet test`
Expected: 50 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs \
        backend/LocaleBoost.Api.Tests/IntegrationTests/PresupuestosControllerTests.cs
git commit -m "feat(presupuestos): expose FacturaId on PresupuestoSummaryDto"
```

---

### Task 4: Frontend — `factura.models.ts` + `FacturasService`

**Files:**
- Create: `frontend/src/app/core/models/factura.models.ts`
- Create: `frontend/src/app/core/models/factura.models.spec.ts`
- Create: `frontend/src/app/features/facturas/facturas.service.ts`
- Create: `frontend/src/app/features/facturas/facturas.service.spec.ts`

**Interfaces:**
- Consumes: `LineaPresupuestoRequest`, `TipoIva`, `TipoLinea` from `core/models/presupuesto.models.ts`; `HttpClient`, `extractErrorMessage`.
- Produces (used by Tasks 5-11): `EstadoFactura` numeric enum, `ESTADO_FACTURA_LABELS`; `LineaFactura`, `Factura`, `FacturaSummary`, `CreateFacturaRequest`, `MarcarCobradaRequest`, `RectificarFacturaRequest`, `ConvertirAFacturaRequest` interfaces; `FacturasService` — `facturas: Signal<FacturaSummary[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `load(clienteId?: string): Promise<void>`, `getById(id: string): Promise<Factura>` (does not touch signals), `create(request: CreateFacturaRequest): Promise<Factura>` (rejects on failure, does not reload on failure), `marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void>` (never rejects, errors go to `errorMessage`), `anular(id: string): Promise<void>` (never rejects), `rectificar(id: string, request: RectificarFacturaRequest): Promise<Factura>` (rejects on failure).

- [ ] **Step 1: Write the model file**

```typescript
// frontend/src/app/core/models/factura.models.ts
import { LineaPresupuestoRequest, TipoIva, TipoLinea } from './presupuesto.models';

export enum EstadoFactura {
  Emitida,
  Cobrada,
  Anulada,
  Rectificada,
}

export const ESTADO_FACTURA_LABELS: Record<EstadoFactura, string> = {
  [EstadoFactura.Emitida]: 'Emitida',
  [EstadoFactura.Cobrada]: 'Cobrada',
  [EstadoFactura.Anulada]: 'Anulada',
  [EstadoFactura.Rectificada]: 'Rectificada',
};

export interface LineaFactura {
  id: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface Factura {
  id: string;
  clienteId: string;
  serieId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  fechaVencimiento: string | null;
  fechaCobro: string | null;
  porcentajeRetencionIrpf: number | null;
  baseImponible: number;
  totalIva: number;
  totalRetencion: number;
  total: number;
  presupuestoOrigenId: string | null;
  facturaRectificadaId: string | null;
  pdfUrl: string | null;
  lineas: LineaFactura[];
  createdAt: string;
}

export interface FacturaSummary {
  id: string;
  clienteId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  total: number;
}

export interface CreateFacturaRequest {
  clienteId: string;
  serieId: string;
  fechaVencimiento: string | null;
  porcentajeRetencionIrpf: number | null;
  lineas: LineaPresupuestoRequest[];
}

export interface MarcarCobradaRequest {
  fechaCobro: string;
}

export interface RectificarFacturaRequest {
  serieRectificativaId: string;
  motivo: string;
  lineasCorregidas: LineaPresupuestoRequest[];
}

export interface ConvertirAFacturaRequest {
  serieId: string;
  porcentajeRetencionIrpf: number | null;
}
```

- [ ] **Step 2: Write the failing label-completeness test**

```typescript
// frontend/src/app/core/models/factura.models.spec.ts
import { EstadoFactura, ESTADO_FACTURA_LABELS } from './factura.models';

function numericValues<T extends Record<string, string | number>>(enumObj: T): number[] {
  return Object.values(enumObj).filter((v): v is number => typeof v === 'number');
}

describe('factura.models label maps', () => {
  it('ESTADO_FACTURA_LABELS has a non-empty entry for every EstadoFactura value', () => {
    for (const value of numericValues(EstadoFactura)) {
      expect(ESTADO_FACTURA_LABELS[value as EstadoFactura]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `./factura.models` module not found.

Since Step 1 already wrote the model file, this will actually pass immediately once the file exists — write Step 1's file, then run this test to confirm it passes rather than expecting a red step here.

- [ ] **Step 4: Write the service**

```typescript
// frontend/src/app/features/facturas/facturas.service.ts
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CreateFacturaRequest,
  Factura,
  FacturaSummary,
  MarcarCobradaRequest,
  RectificarFacturaRequest,
} from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class FacturasService {
  private readonly http = inject(HttpClient);
  // Se recuerda el último filtro de cliente para que las mutaciones (create,
  // marcarCobrada, anular, rectificar) recarguen sin resetear un filtro activo.
  private currentClienteId: string | undefined;

  readonly facturas = signal<FacturaSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(clienteId?: string): Promise<void> {
    this.currentClienteId = clienteId;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const url = clienteId ? `/api/facturas?clienteId=${clienteId}` : '/api/facturas';
      const facturas = await firstValueFrom(this.http.get<FacturaSummary[]>(url));
      this.facturas.set(facturas);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  private reload(): Promise<void> {
    return this.load(this.currentClienteId);
  }

  async getById(id: string): Promise<Factura> {
    return firstValueFrom(this.http.get<Factura>(`/api/facturas/${id}`));
  }

  async create(request: CreateFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(this.http.post<Factura>('/api/facturas', request));
    await this.reload();
    return factura;
  }

  async marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/facturas/${id}/marcar-cobrada`, request));
      await this.reload();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async anular(id: string): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/facturas/${id}/anular`, {}));
      await this.reload();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async rectificar(id: string, request: RectificarFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(this.http.post<Factura>(`/api/facturas/${id}/rectificar`, request));
    await this.reload();
    return factura;
  }
}
```

- [ ] **Step 5: Write the failing service tests**

```typescript
// frontend/src/app/features/facturas/facturas.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturasService } from './facturas.service';
import {
  CreateFacturaRequest,
  EstadoFactura,
  Factura,
  FacturaSummary,
  MarcarCobradaRequest,
  RectificarFacturaRequest,
} from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const summary1: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 121,
};

const factura1: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
};

const createRequest: CreateFacturaRequest = {
  clienteId: 'c1',
  serieId: 's1',
  fechaVencimiento: null,
  porcentajeRetencionIrpf: null,
  lineas: [
    {
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
};

describe('FacturasService', () => {
  let service: FacturasService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FacturasService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FacturasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads facturas on load() without a cliente filter', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.facturas()).toEqual([summary1]);
    expect(service.errorMessage()).toBeNull();
  });

  it('loads facturas filtered by clienteId when given', async () => {
    const loadPromise = service.load('c1');
    const req = httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.facturas()).toEqual([summary1]);
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request and reloads with the currently active cliente filter', async () => {
    const initialLoad = service.load('c1');
    httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET').flush([]);
    await initialLoad;

    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await createPromise;
    expect(result).toEqual(factura1);
  });

  it('create() rejects and does not reload on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'POST');
    postReq.flush({ message: 'El cliente indicado no existe.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.method === 'GET')).toHaveLength(0);
  });

  it('getById() gets the factura by id without touching the list signals', async () => {
    const getPromise = service.getById('f1');
    const req = httpMock.expectOne((r) => r.url === '/api/facturas/f1' && r.method === 'GET');
    req.flush(factura1);

    const result = await getPromise;
    expect(result).toEqual(factura1);
    expect(service.facturas()).toEqual([]);
  });

  it('marcarCobrada() posts the fecha, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const request: MarcarCobradaRequest = { fechaCobro: '2026-08-15T00:00:00Z' };
    const marcarPromise = service.marcarCobrada('f1', request);

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST');
    expect(postReq.request.body).toEqual(request);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    await marcarPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('marcarCobrada() sets errorMessage and does not throw on failure', async () => {
    const marcarPromise = service.marcarCobrada('f1', { fechaCobro: '2026-08-15T00:00:00Z' });
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST');
    postReq.flush(
      { message: 'Solo se pueden marcar como cobradas facturas en estado Emitida.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(marcarPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    expect(httpMock.match((r) => r.method === 'GET')).toHaveLength(0);
  });

  it('anular() posts an empty body, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const anularPromise = service.anular('f1');

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/anular' && r.method === 'POST');
    expect(postReq.request.body).toEqual({});
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    await anularPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('anular() sets errorMessage and does not throw on failure', async () => {
    const anularPromise = service.anular('f1');
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/anular' && r.method === 'POST');
    postReq.flush({ message: 'La factura ya está anulada.' }, { status: 409, statusText: 'Conflict' });

    await expect(anularPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('La factura ya está anulada.');
  });

  it('rectificar() posts the request, reloads the list, and resolves with the rectificativa', async () => {
    const rectificarRequest: RectificarFacturaRequest = {
      serieRectificativaId: 's2',
      motivo: 'Error en el importe',
      lineasCorregidas: createRequest.lineas,
    };
    const rectificarPromise = service.rectificar('f1', rectificarRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/rectificar' && r.method === 'POST');
    expect(postReq.request.body).toEqual(rectificarRequest);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await rectificarPromise;
    expect(result).toEqual(factura1);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all new tests pass; total 25 files / 154 tests (23/140 baseline + 2 new files / 14 new tests — 1 label test + 13 service tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/factura.models.ts \
        frontend/src/app/core/models/factura.models.spec.ts \
        frontend/src/app/features/facturas/facturas.service.ts \
        frontend/src/app/features/facturas/facturas.service.spec.ts
git commit -m "feat(facturas): add factura models and FacturasService"
```

---

### Task 5: Frontend — `FacturaFormModal` (alta manual)

**Files:**
- Create: `frontend/src/app/features/facturas/factura-form-modal.ts`
- Create: `frontend/src/app/features/facturas/factura-form-modal.html`
- Create: `frontend/src/app/features/facturas/factura-form-modal.css`
- Create: `frontend/src/app/features/facturas/factura-form-modal.spec.ts`

**Interfaces:**
- Consumes: `FacturasService.create()` (Task 4), `ClientesService.clientes` (existing), `SeriesService.series` (existing), `TIPO_IVA_PORCENTAJE`/`TipoIva`/`TipoLinea`/`LineaPresupuestoRequest` (existing).
- Produces (used by Task 9): `FacturaFormModal` — `open(): void`, `dialogEl: ElementRef<HTMLDialogElement>` (public `@ViewChild`), `saved = output<void>()`.

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/features/facturas/factura-form-modal.ts
import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { CreateFacturaRequest } from '../../core/models/factura.models';
import {
  LineaPresupuestoRequest,
  TIPO_IVA_PORCENTAJE,
  TipoIva,
  TipoLinea,
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
  selector: 'app-factura-form-modal',
  imports: [FormsModule],
  templateUrl: './factura-form-modal.html',
  styleUrl: './factura-form-modal.css',
})
export class FacturaFormModal {
  private readonly facturasService = inject(FacturasService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly seriesService = inject(SeriesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly clienteId = signal('');
  readonly serieId = signal('');
  readonly fechaVencimiento = signal('');
  readonly porcentajeRetencionIrpf = signal<number | null>(null);
  readonly lineas = signal<LineaFormRow[]>([]);

  protected readonly seriesNoRectificativas = computed(() =>
    this.seriesService.series().filter((s) => !s.esRectificativa),
  );

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
    const totalRetencion = subtotal * ((this.porcentajeRetencionIrpf() ?? 0) / 100);
    return { subtotal, ivaPorTipo, totalIva, totalRetencion, total: subtotal + totalIva - totalRetencion };
  });

  open(): void {
    this.resetForm();
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
    if (!this.clienteId()) {
      this.formError.set('Debés seleccionar un cliente.');
      return;
    }
    if (!this.serieId()) {
      this.formError.set('Debés seleccionar una serie.');
      return;
    }

    const retencionRaw = this.porcentajeRetencionIrpf();
    let retencion: number | null = null;
    if (retencionRaw !== null && retencionRaw !== undefined) {
      const n = Number(retencionRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        this.formError.set('El porcentaje de retención debe estar entre 0 y 100.');
        return;
      }
      retencion = n;
    }

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('La factura debe tener al menos una línea.');
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
      if (fila.precioUnitario === null || fila.precioUnitario === undefined) {
        this.formError.set(`Línea ${n}: el precio unitario es obligatorio.`);
        return;
      }
      const precioUnitario = Number(fila.precioUnitario);
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        this.formError.set(`Línea ${n}: el precio unitario no puede ser negativo.`);
        return;
      }
      lineasRequest.push({ tipo: fila.tipo, descripcion, cantidad, precioUnitario, tipoIva: fila.tipoIva, orden: n });
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const request: CreateFacturaRequest = {
        clienteId: this.clienteId(),
        serieId: this.serieId(),
        fechaVencimiento: this.toInstante(this.fechaVencimiento()),
        porcentajeRetencionIrpf: retencion,
        lineas: lineasRequest,
      };
      await this.facturasService.create(request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private toInstante(fecha: string): string | null {
    return fecha ? `${fecha}T00:00:00Z` : null;
  }

  private resetForm(): void {
    this.clienteId.set('');
    this.serieId.set('');
    this.fechaVencimiento.set('');
    this.porcentajeRetencionIrpf.set(null);
    this.lineas.set([filaVacia()]);
  }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- frontend/src/app/features/facturas/factura-form-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-[640px] max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Nueva factura</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Cliente *
      <select
        [ngModel]="clienteId()"
        (ngModelChange)="clienteId.set($event)"
        name="clienteId"
        class="rounded border border-slate-300 px-3 py-2"
      >
        <option [ngValue]="''" disabled>Seleccioná un cliente…</option>
        @for (cliente of clientesService.clientes(); track cliente.id) {
          <option [ngValue]="cliente.id">{{ cliente.nombre }}</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Serie *
      <select
        [ngModel]="serieId()"
        (ngModelChange)="serieId.set($event)"
        name="serieId"
        class="rounded border border-slate-300 px-3 py-2"
      >
        <option [ngValue]="''" disabled>Seleccioná una serie…</option>
        @for (serie of seriesNoRectificativas(); track serie.id) {
          <option [ngValue]="serie.id">{{ serie.codigo }} ({{ serie.anio }})</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Fecha de vencimiento
      <input
        [ngModel]="fechaVencimiento()"
        (ngModelChange)="fechaVencimiento.set($event)"
        name="fechaVencimiento"
        type="date"
        class="rounded border border-slate-300 px-3 py-2"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      % Retención IRPF
      <input
        [ngModel]="porcentajeRetencionIrpf()"
        (ngModelChange)="porcentajeRetencionIrpf.set($event)"
        name="porcentajeRetencionIrpf"
        type="number"
        class="w-32 rounded border border-slate-300 px-3 py-2"
      />
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
        @if (resumen().totalRetencion > 0) {
          <span>Retención IRPF: -{{ resumen().totalRetencion.toFixed(2) }} €</span>
        }
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

- [ ] **Step 3: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/facturas/factura-form-modal.css */
/* Factura form modal styles */
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/app/features/facturas/factura-form-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { FacturaFormModal } from './factura-form-modal';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { Cliente } from '../../core/models/cliente.models';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

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

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

const factura1: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [],
  createdAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('FacturaFormModal', () => {
  let component: FacturaFormModal;
  let facturasServiceStub: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    facturasServiceStub = { create: vi.fn().mockResolvedValue(factura1) };

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: ClientesService, useValue: { clientes: signal<Cliente[]>([cliente1]) } },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(FacturaFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() resets the form with one empty línea and shows the dialog', () => {
    component.clienteId.set('leftover');
    component.lineas.set([]);
    component.open();

    expect(component.clienteId()).toBe('');
    expect(component.serieId()).toBe('');
    expect(component.porcentajeRetencionIrpf()).toBeNull();
    expect(component.lineas().length).toBe(1);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesNoRectificativas() excludes series marked as rectificativa', () => {
    expect(component.seriesNoRectificativas()).toEqual([serieNormal]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.create).not.toHaveBeenCalled();
  });

  describe('línea management', () => {
    it('addLinea() appends an empty línea with a unique rowId', () => {
      component.open();
      const firstRowId = component.lineas()[0].rowId;
      component.addLinea();
      expect(component.lineas().length).toBe(2);
      expect(component.lineas()[1].rowId).not.toBe(firstRowId);
    });

    it('removeLinea() removes only the targeted row', () => {
      component.open();
      component.addLinea();
      const [row1, row2] = component.lineas();
      component.removeLinea(row1.rowId);
      expect(component.lineas()).toEqual([row2]);
    });

    it('updateLinea() patches only the targeted row', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Nueva' });
      expect(component.lineas()[0].descripcion).toBe('Nueva');
    });
  });

  describe('resumen()', () => {
    it('computes subtotal, IVA and total for a single línea without retención', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 2,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });

      expect(component.resumen().subtotal).toBe(200);
      expect(component.resumen().totalIva).toBe(42);
      expect(component.resumen().totalRetencion).toBe(0);
      expect(component.resumen().total).toBe(242);
    });

    it('subtracts retención IRPF from the total when set', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 1,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });
      component.porcentajeRetencionIrpf.set(15);

      expect(component.resumen().totalRetencion).toBe(15);
      expect(component.resumen().total).toBe(106);
    });

    it('does not throw NaN when cantidad/precioUnitario are null', () => {
      component.open();
      expect(component.resumen().subtotal).toBe(0);
      expect(component.resumen().total).toBe(0);
    });
  });

  describe('validation', () => {
    it('blocks submit without a cliente', async () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });
      component.serieId.set('s1');

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar un cliente.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit without a serie', async () => {
      component.open();
      component.clienteId.set('c1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar una serie.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit when porcentajeRetencionIrpf is out of the 0-100 range', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.porcentajeRetencionIrpf.set(150);
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('El porcentaje de retención debe estar entre 0 y 100.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit with no líneas', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('La factura debe tener al menos una línea.');
    });

    it('blocks submit when a línea has an empty descripción', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la descripción es obligatoria.');
    });

    it('blocks submit when a línea has cantidad <= 0', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 0, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
    });

    it('blocks submit when a línea has a negative precioUnitario', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: -5 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: el precio unitario no puede ser negativo.');
    });
  });

  describe('onSubmit() success/failure', () => {
    it('calls create() with the built request, closes the dialog, and emits saved on success', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.fechaVencimiento.set('2026-09-01');
      component.porcentajeRetencionIrpf.set(15);
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 1,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      await component.onSubmit();

      expect(facturasServiceStub.create).toHaveBeenCalledWith({
        clienteId: 'c1',
        serieId: 's1',
        fechaVencimiento: '2026-09-01T00:00:00Z',
        porcentajeRetencionIrpf: 15,
        lineas: [
          {
            tipo: TipoLinea.ServicioPorHoras,
            descripcion: 'Consultoría',
            cantidad: 1,
            precioUnitario: 100,
            tipoIva: TipoIva.General21,
            orden: 1,
          },
        ],
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
      expect(savedSpy).toHaveBeenCalled();
    });

    it('sets formError and keeps the dialog open on backend failure', async () => {
      facturasServiceStub.create.mockRejectedValue({ error: { message: 'La serie indicada no existe.' } });
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('La serie indicada no existe.');
      expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/facturas/factura-form-modal.ts \
        frontend/src/app/features/facturas/factura-form-modal.html \
        frontend/src/app/features/facturas/factura-form-modal.css \
        frontend/src/app/features/facturas/factura-form-modal.spec.ts
git commit -m "feat(facturas): add FacturaFormModal for manual creation"
```

---

### Task 6: Frontend — `FacturaDetalleModal` (solo lectura)

**Files:**
- Create: `frontend/src/app/features/facturas/factura-detalle-modal.ts`
- Create: `frontend/src/app/features/facturas/factura-detalle-modal.html`
- Create: `frontend/src/app/features/facturas/factura-detalle-modal.css`
- Create: `frontend/src/app/features/facturas/factura-detalle-modal.spec.ts`

**Interfaces:**
- Consumes: `ESTADO_FACTURA_LABELS` (Task 4), `TIPO_LINEA_LABELS`/`TIPO_IVA_LABELS` (existing).
- Produces (used by Task 9): `FacturaDetalleModal` — `open(factura: Factura): void`, `close(): void`, `dialogEl: ElementRef<HTMLDialogElement>` (public), `factura: Signal<Factura | null>`.

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/features/facturas/factura-detalle-modal.ts
import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { ESTADO_FACTURA_LABELS, Factura } from '../../core/models/factura.models';
import { TIPO_IVA_LABELS, TIPO_LINEA_LABELS } from '../../core/models/presupuesto.models';

@Component({
  selector: 'app-factura-detalle-modal',
  imports: [],
  templateUrl: './factura-detalle-modal.html',
  styleUrl: './factura-detalle-modal.css',
})
export class FacturaDetalleModal {
  protected readonly ESTADO_FACTURA_LABELS = ESTADO_FACTURA_LABELS;
  protected readonly TIPO_LINEA_LABELS = TIPO_LINEA_LABELS;
  protected readonly TIPO_IVA_LABELS = TIPO_IVA_LABELS;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly factura = signal<Factura | null>(null);

  open(factura: Factura): void {
    this.factura.set(factura);
    this.dialogEl.nativeElement.showModal();
  }

  close(): void {
    this.dialogEl.nativeElement.close();
  }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- frontend/src/app/features/facturas/factura-detalle-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  @if (factura(); as f) {
    <div class="flex w-[640px] max-w-full flex-col gap-3 p-6">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-semibold">{{ f.numeroCompleto }}</h2>
          <p class="text-sm text-slate-500">{{ ESTADO_FACTURA_LABELS[f.estado] }}</p>
        </div>
        <button type="button" (click)="close()" class="text-sm text-slate-600 hover:underline">Cerrar</button>
      </div>

      @if (f.presupuestoOrigenId) {
        <p class="rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Generada desde el presupuesto {{ f.presupuestoOrigenId }}.
        </p>
      }
      @if (f.facturaRectificadaId) {
        <p class="rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Rectifica la factura {{ f.facturaRectificadaId }}.
        </p>
      }

      <table class="w-full border-collapse text-left text-xs">
        <thead>
          <tr class="border-b border-slate-200 text-slate-500">
            <th class="py-1">Tipo</th>
            <th class="py-1">Descripción</th>
            <th class="py-1">Cantidad</th>
            <th class="py-1">Precio</th>
            <th class="py-1">IVA</th>
          </tr>
        </thead>
        <tbody>
          @for (linea of f.lineas; track linea.id) {
            <tr class="border-b border-slate-100">
              <td class="py-1 pr-1">{{ TIPO_LINEA_LABELS[linea.tipo] }}</td>
              <td class="py-1 pr-1">{{ linea.descripcion }}</td>
              <td class="py-1 pr-1">{{ linea.cantidad }}</td>
              <td class="py-1 pr-1">{{ linea.precioUnitario.toFixed(2) }} €</td>
              <td class="py-1 pr-1">{{ TIPO_IVA_LABELS[linea.tipoIva] }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="flex flex-col items-end gap-0.5 text-sm text-slate-600">
        <span>Base imponible: {{ f.baseImponible.toFixed(2) }} €</span>
        <span>IVA: {{ f.totalIva.toFixed(2) }} €</span>
        @if (f.totalRetencion > 0) {
          <span>Retención IRPF: -{{ f.totalRetencion.toFixed(2) }} €</span>
        }
        <span class="font-semibold text-slate-900">Total: {{ f.total.toFixed(2) }} €</span>
      </div>
    </div>
  }
</dialog>
```

- [ ] **Step 3: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/facturas/factura-detalle-modal.css */
/* Factura detalle modal styles */
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/app/features/facturas/factura-detalle-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const factura1: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('FacturaDetalleModal', () => {
  let component: FacturaDetalleModal;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(FacturaDetalleModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() sets the factura signal and shows the dialog', () => {
    component.open(factura1);
    expect(component.factura()).toEqual(factura1);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('close() closes the dialog', () => {
    component.open(factura1);
    component.close();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/facturas/factura-detalle-modal.ts \
        frontend/src/app/features/facturas/factura-detalle-modal.html \
        frontend/src/app/features/facturas/factura-detalle-modal.css \
        frontend/src/app/features/facturas/factura-detalle-modal.spec.ts
git commit -m "feat(facturas): add read-only FacturaDetalleModal"
```

---

### Task 7: Frontend — `MarcarCobradaModal`

**Files:**
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.ts`
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.html`
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.css`
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts`

**Interfaces:**
- Consumes: `FacturasService.marcarCobrada()` and `.errorMessage` (Task 4) — note `marcarCobrada()` never rejects; failures surface via `errorMessage`, so this modal reads `errorMessage()` after awaiting the call rather than catching an exception.
- Produces (used by Task 9): `MarcarCobradaModal` — `open(facturaId: string): void`, `dialogEl` (public), no output (the list re-renders from the service's own signal after `marcarCobrada()` reloads it).

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/features/facturas/marcar-cobrada-modal.ts
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FacturasService } from './facturas.service';

function hoyLocal(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-marcar-cobrada-modal',
  imports: [FormsModule],
  templateUrl: './marcar-cobrada-modal.html',
  styleUrl: './marcar-cobrada-modal.css',
})
export class MarcarCobradaModal {
  private readonly facturasService = inject(FacturasService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly facturaId = signal<string | null>(null);
  readonly fechaCobro = signal('');

  open(facturaId: string): void {
    this.facturaId.set(facturaId);
    this.fechaCobro.set(hoyLocal());
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const facturaId = this.facturaId();
    if (!facturaId) {
      return;
    }
    if (!this.fechaCobro()) {
      this.formError.set('La fecha de cobro es obligatoria.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    await this.facturasService.marcarCobrada(facturaId, { fechaCobro: `${this.fechaCobro()}T00:00:00Z` });
    this.isSaving.set(false);

    const error = this.facturasService.errorMessage();
    if (error) {
      this.formError.set(error);
      return;
    }
    this.dialogEl.nativeElement.close();
  }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- frontend/src/app/features/facturas/marcar-cobrada-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Marcar como cobrada</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Fecha de cobro *
      <input
        [ngModel]="fechaCobro()"
        (ngModelChange)="fechaCobro.set($event)"
        name="fechaCobro"
        type="date"
        class="rounded border border-slate-300 px-3 py-2"
      />
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
        {{ isSaving() ? 'Guardando…' : 'Confirmar' }}
      </button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 3: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/facturas/marcar-cobrada-modal.css */
/* Marcar cobrada modal styles */
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { FacturasService } from './facturas.service';

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('MarcarCobradaModal', () => {
  let component: MarcarCobradaModal;
  let facturasServiceStub: {
    marcarCobrada: ReturnType<typeof vi.fn>;
    errorMessage: ReturnType<typeof signal<string | null>>;
  };

  beforeEach(() => {
    facturasServiceStub = {
      marcarCobrada: vi.fn().mockResolvedValue(undefined),
      errorMessage: signal<string | null>(null),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: FacturasService, useValue: facturasServiceStub }],
    });

    component = TestBed.createComponent(MarcarCobradaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() defaults fechaCobro to today and shows the dialog', () => {
    component.open('f1');
    expect(component.facturaId()).toBe('f1');
    expect(component.fechaCobro()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });

  it('onSubmit() sends fechaCobro as a UTC instant and closes the dialog on success', async () => {
    component.open('f1');
    component.fechaCobro.set('2026-08-15');

    await component.onSubmit();

    expect(facturasServiceStub.marcarCobrada).toHaveBeenCalledWith('f1', { fechaCobro: '2026-08-15T00:00:00Z' });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
  });

  it('onSubmit() shows the service errorMessage and keeps the dialog open on failure', async () => {
    facturasServiceStub.errorMessage.set('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    component.open('f1');

    await component.onSubmit();

    expect(component.formError()).toBe('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/facturas/marcar-cobrada-modal.ts \
        frontend/src/app/features/facturas/marcar-cobrada-modal.html \
        frontend/src/app/features/facturas/marcar-cobrada-modal.css \
        frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts
git commit -m "feat(facturas): add MarcarCobradaModal"
```

---

### Task 8: Frontend — `RectificarModal`

**Files:**
- Create: `frontend/src/app/features/facturas/rectificar-modal.ts`
- Create: `frontend/src/app/features/facturas/rectificar-modal.html`
- Create: `frontend/src/app/features/facturas/rectificar-modal.css`
- Create: `frontend/src/app/features/facturas/rectificar-modal.spec.ts`

**Interfaces:**
- Consumes: `FacturasService.rectificar()` (Task 4), `SeriesService.series` (existing).
- Produces (used by Task 9): `RectificarModal` — `open(original: Factura): void`, `dialogEl` (public), `saved = output<void>()`.

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/features/facturas/rectificar-modal.ts
import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { SeriesService } from '../series/series.service';
import { Factura, RectificarFacturaRequest } from '../../core/models/factura.models';
import {
  LineaPresupuestoRequest,
  TIPO_IVA_PORCENTAJE,
  TipoIva,
  TipoLinea,
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

@Component({
  selector: 'app-rectificar-modal',
  imports: [FormsModule],
  templateUrl: './rectificar-modal.html',
  styleUrl: './rectificar-modal.css',
})
export class RectificarModal {
  private readonly facturasService = inject(FacturasService);
  protected readonly seriesService = inject(SeriesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly facturaOriginalId = signal<string | null>(null);
  readonly serieRectificativaId = signal('');
  readonly motivo = signal('');
  readonly lineas = signal<LineaFormRow[]>([]);

  protected readonly seriesRectificativas = computed(() =>
    this.seriesService.series().filter((s) => s.esRectificativa),
  );

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

  open(original: Factura): void {
    this.facturaOriginalId.set(original.id);
    this.serieRectificativaId.set('');
    this.motivo.set('');
    this.lineas.set(
      original.lineas.map((l) => ({
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
    this.lineas.update((rows) => [
      ...rows,
      {
        rowId: crypto.randomUUID(),
        tipo: TipoLinea.ServicioPorHoras,
        descripcion: '',
        cantidad: null,
        precioUnitario: null,
        tipoIva: TipoIva.General21,
      },
    ]);
  }

  removeLinea(rowId: string): void {
    this.lineas.update((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  updateLinea(rowId: string, patch: Partial<LineaFormRow>): void {
    this.lineas.update((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async onSubmit(): Promise<void> {
    const facturaOriginalId = this.facturaOriginalId();
    if (!facturaOriginalId) {
      return;
    }
    if (!this.serieRectificativaId()) {
      this.formError.set('Debés seleccionar una serie rectificativa.');
      return;
    }
    if (!this.motivo().trim()) {
      this.formError.set('El motivo es obligatorio.');
      return;
    }

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('La factura rectificativa debe tener al menos una línea.');
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
      if (fila.precioUnitario === null || fila.precioUnitario === undefined) {
        this.formError.set(`Línea ${n}: el precio unitario es obligatorio.`);
        return;
      }
      const precioUnitario = Number(fila.precioUnitario);
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        this.formError.set(`Línea ${n}: el precio unitario no puede ser negativo.`);
        return;
      }
      lineasRequest.push({ tipo: fila.tipo, descripcion, cantidad, precioUnitario, tipoIva: fila.tipoIva, orden: n });
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const request: RectificarFacturaRequest = {
        serieRectificativaId: this.serieRectificativaId(),
        motivo: this.motivo().trim(),
        lineasCorregidas: lineasRequest,
      };
      await this.facturasService.rectificar(facturaOriginalId, request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- frontend/src/app/features/facturas/rectificar-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-[640px] max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Rectificar factura</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Serie rectificativa *
      <select
        [ngModel]="serieRectificativaId()"
        (ngModelChange)="serieRectificativaId.set($event)"
        name="serieRectificativaId"
        class="rounded border border-slate-300 px-3 py-2"
      >
        <option [ngValue]="''" disabled>Seleccioná una serie…</option>
        @for (serie of seriesRectificativas(); track serie.id) {
          <option [ngValue]="serie.id">{{ serie.codigo }} ({{ serie.anio }})</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Motivo *
      <textarea
        [ngModel]="motivo()"
        (ngModelChange)="motivo.set($event)"
        name="motivo"
        rows="2"
        class="rounded border border-slate-300 px-3 py-2"
      ></textarea>
    </label>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Líneas corregidas</span>
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
        {{ isSaving() ? 'Guardando…' : 'Confirmar rectificación' }}
      </button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 3: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/facturas/rectificar-modal.css */
/* Rectificar modal styles */
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/app/features/facturas/rectificar-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { RectificarModal } from './rectificar-modal';
import { FacturasService } from './facturas.service';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 5, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

const facturaOriginal: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00005',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('RectificarModal', () => {
  let component: RectificarModal;
  let facturasServiceStub: { rectificar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    facturasServiceStub = { rectificar: vi.fn().mockResolvedValue(facturaOriginal) };

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(RectificarModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() preloads líneas from the original factura with new rowIds', () => {
    component.open(facturaOriginal);

    expect(component.facturaOriginalId()).toBe('f1');
    expect(component.lineas().length).toBe(1);
    expect(component.lineas()[0].descripcion).toBe('Consultoría');
    expect(component.lineas()[0].rowId).not.toBe('l1');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesRectificativas() excludes non-rectificativa series', () => {
    expect(component.seriesRectificativas()).toEqual([serieRectificativa]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
  });

  describe('validation', () => {
    it('blocks submit without a serie rectificativa', async () => {
      component.open(facturaOriginal);
      component.motivo.set('Error en el importe');

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar una serie rectificativa.');
      expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
    });

    it('blocks submit without a motivo', async () => {
      component.open(facturaOriginal);
      component.serieRectificativaId.set('s2');

      await component.onSubmit();

      expect(component.formError()).toBe('El motivo es obligatorio.');
      expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
    });

    it('blocks submit with no líneas', async () => {
      component.open(facturaOriginal);
      component.serieRectificativaId.set('s2');
      component.motivo.set('Error en el importe');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('La factura rectificativa debe tener al menos una línea.');
    });
  });

  it('onSubmit() calls rectificar() with the built request, closes the dialog, and emits saved on success', async () => {
    component.open(facturaOriginal);
    component.serieRectificativaId.set('s2');
    component.motivo.set('Error en el importe');
    const [row1] = component.lineas();
    component.updateLinea(row1.rowId, { precioUnitario: 90 });

    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    await component.onSubmit();

    expect(facturasServiceStub.rectificar).toHaveBeenCalledWith('f1', {
      serieRectificativaId: 's2',
      motivo: 'Error en el importe',
      lineasCorregidas: [
        {
          tipo: TipoLinea.ServicioPorHoras,
          descripcion: 'Consultoría',
          cantidad: 1,
          precioUnitario: 90,
          tipoIva: TipoIva.General21,
          orden: 1,
        },
      ],
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('sets formError and keeps the dialog open on backend failure', async () => {
    facturasServiceStub.rectificar.mockRejectedValue({
      error: { message: 'La serie indicada no está marcada como rectificativa.' },
    });
    component.open(facturaOriginal);
    component.serieRectificativaId.set('s2');
    component.motivo.set('Error en el importe');

    await component.onSubmit();

    expect(component.formError()).toBe('La serie indicada no está marcada como rectificativa.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/facturas/rectificar-modal.ts \
        frontend/src/app/features/facturas/rectificar-modal.html \
        frontend/src/app/features/facturas/rectificar-modal.css \
        frontend/src/app/features/facturas/rectificar-modal.spec.ts
git commit -m "feat(facturas): add RectificarModal"
```

---

### Task 9: Frontend — `Facturas` list component + routing + nav

**Files:**
- Create: `frontend/src/app/features/facturas/facturas.ts`
- Create: `frontend/src/app/features/facturas/facturas.html`
- Create: `frontend/src/app/features/facturas/facturas.css`
- Create: `frontend/src/app/features/facturas/facturas.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/layout/layout.html`

**Interfaces:**
- Consumes: `FacturasService` (Task 4), `FacturaFormModal` (Task 5), `FacturaDetalleModal` (Task 6), `MarcarCobradaModal` (Task 7), `RectificarModal` (Task 8), `ClientesService`/`SeriesService` (existing).
- Produces: the `/facturas` route.

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/features/facturas/facturas.ts
import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { FacturaFormModal } from './factura-form-modal';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { RectificarModal } from './rectificar-modal';
import { ESTADO_FACTURA_LABELS, EstadoFactura, FacturaSummary } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-facturas',
  imports: [FormsModule, FacturaFormModal, FacturaDetalleModal, MarcarCobradaModal, RectificarModal],
  templateUrl: './facturas.html',
  styleUrl: './facturas.css',
})
export class Facturas implements OnInit {
  protected readonly facturasService = inject(FacturasService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly seriesService = inject(SeriesService);
  protected readonly EstadoFactura = EstadoFactura;
  protected readonly ESTADO_FACTURA_LABELS = ESTADO_FACTURA_LABELS;

  @ViewChild(FacturaFormModal) formModal!: FacturaFormModal;
  @ViewChild(FacturaDetalleModal) detalleModal!: FacturaDetalleModal;
  @ViewChild(MarcarCobradaModal) marcarCobradaModal!: MarcarCobradaModal;
  @ViewChild(RectificarModal) rectificarModal!: RectificarModal;

  readonly filtroClienteId = signal('');
  readonly filtroEstado = signal<EstadoFactura | null>(null);
  readonly filtroNumero = signal('');

  readonly facturasFiltradas = computed(() => {
    const estado = this.filtroEstado();
    const numero = this.filtroNumero().trim().toLowerCase();
    return this.facturasService.facturas().filter((f) => {
      if (estado !== null && f.estado !== estado) {
        return false;
      }
      if (numero && !f.numeroCompleto.toLowerCase().includes(numero)) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    void this.facturasService.load();
    void this.clientesService.load();
    void this.seriesService.load();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }

  onFiltroClienteChange(clienteId: string): void {
    this.filtroClienteId.set(clienteId);
    void this.facturasService.load(clienteId || undefined);
  }

  onNew(): void {
    this.formModal.open();
  }

  async onVerDetalle(f: FacturaSummary): Promise<void> {
    try {
      const detalle = await this.facturasService.getById(f.id);
      this.detalleModal.open(detalle);
    } catch (error) {
      this.facturasService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  onMarcarCobrada(f: FacturaSummary): void {
    this.marcarCobradaModal.open(f.id);
  }

  async onAnular(f: FacturaSummary): Promise<void> {
    if (!confirm(`¿Anular la factura ${f.numeroCompleto}?`)) {
      return;
    }
    await this.facturasService.anular(f.id);
  }

  async onRectificar(f: FacturaSummary): Promise<void> {
    try {
      const detalle = await this.facturasService.getById(f.id);
      this.rectificarModal.open(detalle);
    } catch (error) {
      this.facturasService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  onSaved(): void {
    // No-op: FacturasService.create()/rectificar() already reload the list
    // themselves, and the modals close themselves on success. Bound to
    // (saved) only so the modals' documented outputs have a consumer.
  }
}
```

- [ ] **Step 2: Write the template**

```html
<!-- frontend/src/app/features/facturas/facturas.html -->
<div class="mx-auto max-w-6xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Facturas</h1>
    <button type="button" (click)="onNew()" class="rounded bg-slate-900 px-4 py-2 text-sm text-white">
      Nueva factura
    </button>
  </div>

  @if (facturasService.errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ facturasService.errorMessage() }}</p>
  }

  <div class="mb-4 flex flex-wrap gap-3">
    <select
      [ngModel]="filtroClienteId()"
      (ngModelChange)="onFiltroClienteChange($event)"
      class="rounded border border-slate-300 px-3 py-2 text-sm"
    >
      <option [ngValue]="''">Todos los clientes</option>
      @for (cliente of clientesService.clientes(); track cliente.id) {
        <option [ngValue]="cliente.id">{{ cliente.nombre }}</option>
      }
    </select>

    <select
      [ngModel]="filtroEstado()"
      (ngModelChange)="filtroEstado.set($event)"
      class="rounded border border-slate-300 px-3 py-2 text-sm"
    >
      <option [ngValue]="null">Todos los estados</option>
      <option [ngValue]="EstadoFactura.Emitida">Emitida</option>
      <option [ngValue]="EstadoFactura.Cobrada">Cobrada</option>
      <option [ngValue]="EstadoFactura.Anulada">Anulada</option>
      <option [ngValue]="EstadoFactura.Rectificada">Rectificada</option>
    </select>

    <input
      [ngModel]="filtroNumero()"
      (ngModelChange)="filtroNumero.set($event)"
      type="text"
      placeholder="Buscar por número…"
      class="rounded border border-slate-300 px-3 py-2 text-sm"
    />
  </div>

  @if (facturasService.isLoading()) {
    <p class="text-sm text-slate-500">Cargando…</p>
  } @else if (facturasFiltradas().length > 0) {
    <table class="w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Número</th>
          <th class="py-2">Cliente</th>
          <th class="py-2">Fecha emisión</th>
          <th class="py-2">Estado</th>
          <th class="py-2">Total</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (f of facturasFiltradas(); track f.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2">{{ f.numeroCompleto }}</td>
            <td class="py-2">{{ nombreCliente(f.clienteId) }}</td>
            <td class="py-2">{{ formatFecha(f.fechaEmision) }}</td>
            <td class="py-2">{{ ESTADO_FACTURA_LABELS[f.estado] }}</td>
            <td class="py-2">{{ f.total.toFixed(2) }} €</td>
            <td class="py-2 text-right">
              <button type="button" (click)="onVerDetalle(f)" class="mr-3 text-slate-600 hover:underline">
                Ver detalle
              </button>
              @if (f.estado === EstadoFactura.Emitida) {
                <button type="button" (click)="onMarcarCobrada(f)" class="mr-3 text-slate-600 hover:underline">
                  Marcar cobrada
                </button>
              }
              @if (f.estado === EstadoFactura.Emitida || f.estado === EstadoFactura.Cobrada) {
                <button type="button" (click)="onRectificar(f)" class="mr-3 text-slate-600 hover:underline">
                  Rectificar
                </button>
                <button type="button" (click)="onAnular(f)" class="text-red-600 hover:underline">Anular</button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  } @else {
    <p class="text-sm text-slate-500">No hay facturas que coincidan con los filtros.</p>
  }

  <app-factura-form-modal (saved)="onSaved()" />
  <app-factura-detalle-modal />
  <app-marcar-cobrada-modal />
  <app-rectificar-modal (saved)="onSaved()" />
</div>
```

- [ ] **Step 3: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/facturas/facturas.css */
/* Facturas list styles */
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/app/features/facturas/facturas.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Facturas } from './facturas';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { FacturaFormModal } from './factura-form-modal';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { RectificarModal } from './rectificar-modal';
import { Cliente } from '../../core/models/cliente.models';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura, FacturaSummary } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

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

const serie1: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 5, anio: 2026, esRectificativa: false };

const summaryEmitida: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 121,
};

const summaryCobrada: FacturaSummary = {
  id: 'f2',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00002',
  estado: EstadoFactura.Cobrada,
  fechaEmision: '2026-08-02T00:00:00Z',
  total: 242,
};

const summaryAnulada: FacturaSummary = {
  id: 'f3',
  clienteId: 'desconocido',
  numeroCompleto: 'FAC-2026-00003',
  estado: EstadoFactura.Anulada,
  fechaEmision: '2026-08-03T00:00:00Z',
  total: 50,
};

const detalle1: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
};

function makeStubs() {
  const facturasServiceStub = {
    facturas: signal<FacturaSummary[]>([summaryEmitida, summaryCobrada, summaryAnulada]),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    load: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(detalle1),
    anular: vi.fn().mockResolvedValue(undefined),
  };
  const clientesServiceStub = {
    clientes: signal<Cliente[]>([cliente1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  const seriesServiceStub = {
    series: signal<Serie[]>([serie1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { facturasServiceStub, clientesServiceStub, seriesServiceStub };
}

describe('Facturas', () => {
  let component: Facturas;
  let facturasServiceStub: ReturnType<typeof makeStubs>['facturasServiceStub'];
  let clientesServiceStub: ReturnType<typeof makeStubs>['clientesServiceStub'];
  let seriesServiceStub: ReturnType<typeof makeStubs>['seriesServiceStub'];

  beforeEach(() => {
    const stubs = makeStubs();
    facturasServiceStub = stubs.facturasServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    seriesServiceStub = stubs.seriesServiceStub;

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
        { provide: SeriesService, useValue: seriesServiceStub },
      ],
    });

    component = TestBed.createComponent(Facturas).componentInstance;
    component.formModal = { open: vi.fn() } as unknown as FacturaFormModal;
    component.detalleModal = { open: vi.fn() } as unknown as FacturaDetalleModal;
    component.marcarCobradaModal = { open: vi.fn() } as unknown as MarcarCobradaModal;
    component.rectificarModal = { open: vi.fn() } as unknown as RectificarModal;
  });

  it('ngOnInit() loads facturas, clientes, and series', () => {
    component.ngOnInit();
    expect(facturasServiceStub.load).toHaveBeenCalledWith();
    expect(clientesServiceStub.load).toHaveBeenCalled();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('nombreCliente() resolves the cliente name or a fallback', () => {
    expect(component.nombreCliente('c1')).toBe('Acme SL');
    expect(component.nombreCliente('desconocido')).toBe('—');
  });

  describe('facturasFiltradas()', () => {
    it('returns all facturas when no filter is set', () => {
      expect(component.facturasFiltradas()).toEqual([summaryEmitida, summaryCobrada, summaryAnulada]);
    });

    it('filters by estado', () => {
      component.filtroEstado.set(EstadoFactura.Cobrada);
      expect(component.facturasFiltradas()).toEqual([summaryCobrada]);
    });

    it('filters by número (case-insensitive substring)', () => {
      component.filtroNumero.set('00002');
      expect(component.facturasFiltradas()).toEqual([summaryCobrada]);
    });
  });

  it('onFiltroClienteChange() updates the signal and reloads facturas scoped to the cliente', () => {
    component.onFiltroClienteChange('c1');
    expect(component.filtroClienteId()).toBe('c1');
    expect(facturasServiceStub.load).toHaveBeenCalledWith('c1');
  });

  it('onNew() opens the form modal', () => {
    component.onNew();
    expect(component.formModal.open).toHaveBeenCalled();
  });

  it('onVerDetalle() fetches the detail and opens the detalle modal', async () => {
    await component.onVerDetalle(summaryEmitida);
    expect(facturasServiceStub.getById).toHaveBeenCalledWith('f1');
    expect(component.detalleModal.open).toHaveBeenCalledWith(detalle1);
  });

  it('onMarcarCobrada() opens the marcar-cobrada modal with the factura id', () => {
    component.onMarcarCobrada(summaryEmitida);
    expect(component.marcarCobradaModal.open).toHaveBeenCalledWith('f1');
  });

  describe('onAnular()', () => {
    it('calls anular() when confirmed', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
      await component.onAnular(summaryEmitida);
      expect(facturasServiceStub.anular).toHaveBeenCalledWith('f1');
    });

    it('does not call anular() when cancelled', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
      await component.onAnular(summaryEmitida);
      expect(facturasServiceStub.anular).not.toHaveBeenCalled();
    });
  });

  it('onRectificar() fetches the detail and opens the rectificar modal', async () => {
    await component.onRectificar(summaryEmitida);
    expect(facturasServiceStub.getById).toHaveBeenCalledWith('f1');
    expect(component.rectificarModal.open).toHaveBeenCalledWith(detalle1);
  });
});
```

- [ ] **Step 5: Wire the route**

In `frontend/src/app/app.routes.ts`, add the import and the route entry (after `presupuestos`):

```typescript
import { Facturas } from './features/facturas/facturas';
```

```typescript
      { path: 'presupuestos', component: Presupuestos },
      { path: 'facturas', component: Facturas },
```

- [ ] **Step 6: Wire the nav link**

In `frontend/src/app/shared/layout/layout.html`, add after the Presupuestos link:

```html
      <a routerLink="/facturas" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Facturas
      </a>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/facturas/facturas.ts \
        frontend/src/app/features/facturas/facturas.html \
        frontend/src/app/features/facturas/facturas.css \
        frontend/src/app/features/facturas/facturas.spec.ts \
        frontend/src/app/app.routes.ts \
        frontend/src/app/shared/layout/layout.html
git commit -m "feat(facturas): add Facturas list screen with route and nav link"
```

---

### Task 10: Frontend — `PresupuestosService.convertirAFactura()` + `ConvertirAFacturaModal`

**Files:**
- Modify: `frontend/src/app/features/presupuestos/presupuestos.service.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.html`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.css`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts`

**Interfaces:**
- Consumes: `ConvertirAFacturaRequest`, `Factura` (Task 4), `SeriesService` (existing).
- Produces (used by Task 11): `PresupuestosService.convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<Factura>` (rejects on failure, reloads presupuestos on success); `ConvertirAFacturaModal` — `open(presupuestoId: string): void`, `dialogEl` (public), `converted = output<Factura>()`.

- [ ] **Step 1: Write the failing service test**

Add to `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts` (add `ConvertirAFacturaRequest, EstadoFactura, Factura` to the import from `'../../core/models/factura.models'`):

```typescript
import { ConvertirAFacturaRequest, EstadoFactura, Factura } from '../../core/models/factura.models';
```

```typescript
  it('convertirAFactura() posts the request, reloads the list, and resolves with the created factura', async () => {
    const request: ConvertirAFacturaRequest = { serieId: 's1', porcentajeRetencionIrpf: null };
    const facturaCreada: Factura = {
      id: 'f1',
      clienteId: 'c1',
      serieId: 's1',
      numeroCompleto: 'FAC-2026-00001',
      estado: EstadoFactura.Emitida,
      fechaEmision: '2026-08-06T00:00:00Z',
      fechaVencimiento: null,
      fechaCobro: null,
      porcentajeRetencionIrpf: null,
      baseImponible: 100,
      totalIva: 21,
      totalRetencion: 0,
      total: 121,
      presupuestoOrigenId: 'p1',
      facturaRectificadaId: null,
      pdfUrl: null,
      lineas: [],
      createdAt: '2026-08-06T00:00:00Z',
    };

    const convertirPromise = service.convertirAFactura('p1', request);
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    expect(postReq.request.body).toEqual(request);
    postReq.flush(facturaCreada);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([]);

    const result = await convertirPromise;
    expect(result).toEqual(facturaCreada);
  });

  it('convertirAFactura() rejects and does not reload the list on failure', async () => {
    const request: ConvertirAFacturaRequest = { serieId: 's1', porcentajeRetencionIrpf: null };
    const convertirPromise = service.convertirAFactura('p1', request);
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    postReq.flush(
      { message: 'Solo se pueden convertir presupuestos en estado Aceptado.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(convertirPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `service.convertirAFactura` is not a function.

- [ ] **Step 3: Add `convertirAFactura()` to `PresupuestosService`**

In `frontend/src/app/features/presupuestos/presupuestos.service.ts`, add the import and method:

```typescript
import { ConvertirAFacturaRequest, Factura } from '../../core/models/factura.models';
```

```typescript
  async convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(
      this.http.post<Factura>(`/api/presupuestos/${id}/convertir-a-factura`, request),
    );
    await this.load();
    return factura;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Write the `ConvertirAFacturaModal` component**

```typescript
// frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts
import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
import { ConvertirAFacturaRequest, Factura } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-convertir-a-factura-modal',
  imports: [FormsModule],
  templateUrl: './convertir-a-factura-modal.html',
  styleUrl: './convertir-a-factura-modal.css',
})
export class ConvertirAFacturaModal {
  private readonly presupuestosService = inject(PresupuestosService);
  protected readonly seriesService = inject(SeriesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly converted = output<Factura>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly presupuestoId = signal<string | null>(null);
  readonly serieId = signal('');
  readonly porcentajeRetencionIrpf = signal<number | null>(null);

  protected readonly seriesNoRectificativas = computed(() =>
    this.seriesService.series().filter((s) => !s.esRectificativa),
  );

  open(presupuestoId: string): void {
    this.presupuestoId.set(presupuestoId);
    this.serieId.set('');
    this.porcentajeRetencionIrpf.set(null);
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const presupuestoId = this.presupuestoId();
    if (!presupuestoId) {
      return;
    }
    if (!this.serieId()) {
      this.formError.set('Debés seleccionar una serie.');
      return;
    }

    const retencionRaw = this.porcentajeRetencionIrpf();
    let retencion: number | null = null;
    if (retencionRaw !== null && retencionRaw !== undefined) {
      const n = Number(retencionRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        this.formError.set('El porcentaje de retención debe estar entre 0 y 100.');
        return;
      }
      retencion = n;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const request: ConvertirAFacturaRequest = { serieId: this.serieId(), porcentajeRetencionIrpf: retencion };
      const factura = await this.presupuestosService.convertirAFactura(presupuestoId, request);
      this.dialogEl.nativeElement.close();
      this.converted.emit(factura);
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }
}
```

- [ ] **Step 6: Write the template**

```html
<!-- frontend/src/app/features/presupuestos/convertir-a-factura-modal.html -->
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Convertir a factura</h2>

    @if (formError()) {
      <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError() }}</p>
    }

    <label class="flex flex-col gap-1 text-sm">
      Serie *
      <select
        [ngModel]="serieId()"
        (ngModelChange)="serieId.set($event)"
        name="serieId"
        class="rounded border border-slate-300 px-3 py-2"
      >
        <option [ngValue]="''" disabled>Seleccioná una serie…</option>
        @for (serie of seriesNoRectificativas(); track serie.id) {
          <option [ngValue]="serie.id">{{ serie.codigo }} ({{ serie.anio }})</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      % Retención IRPF
      <input
        [ngModel]="porcentajeRetencionIrpf()"
        (ngModelChange)="porcentajeRetencionIrpf.set($event)"
        name="porcentajeRetencionIrpf"
        type="number"
        class="w-32 rounded border border-slate-300 px-3 py-2"
      />
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
        {{ isSaving() ? 'Convirtiendo…' : 'Convertir' }}
      </button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 7: Write the (empty) stylesheet**

```css
/* frontend/src/app/features/presupuestos/convertir-a-factura-modal.css */
/* Convertir a factura modal styles */
```

- [ ] **Step 8: Write the failing modal tests**

```typescript
// frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

const facturaCreada: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-06T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: 'p1',
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [],
  createdAt: '2026-08-06T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('ConvertirAFacturaModal', () => {
  let component: ConvertirAFacturaModal;
  let presupuestosServiceStub: { convertirAFactura: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    presupuestosServiceStub = { convertirAFactura: vi.fn().mockResolvedValue(facturaCreada) };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(ConvertirAFacturaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() resets the form and shows the dialog', () => {
    component.serieId.set('leftover');
    component.open('p1');

    expect(component.presupuestoId()).toBe('p1');
    expect(component.serieId()).toBe('');
    expect(component.porcentajeRetencionIrpf()).toBeNull();
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesNoRectificativas() excludes series marked as rectificativa', () => {
    expect(component.seriesNoRectificativas()).toEqual([serieNormal]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('blocks submit without a serie', async () => {
    component.open('p1');
    await component.onSubmit();

    expect(component.formError()).toBe('Debés seleccionar una serie.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('blocks submit when porcentajeRetencionIrpf is out of the 0-100 range', async () => {
    component.open('p1');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(150);

    await component.onSubmit();

    expect(component.formError()).toBe('El porcentaje de retención debe estar entre 0 y 100.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('onSubmit() calls convertirAFactura(), closes the dialog, and emits converted on success', async () => {
    component.open('p1');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(15);

    const convertedSpy = vi.fn();
    component.converted.subscribe(convertedSpy);

    await component.onSubmit();

    expect(presupuestosServiceStub.convertirAFactura).toHaveBeenCalledWith('p1', {
      serieId: 's1',
      porcentajeRetencionIrpf: 15,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(convertedSpy).toHaveBeenCalledWith(facturaCreada);
  });

  it('sets formError and keeps the dialog open on backend failure', async () => {
    presupuestosServiceStub.convertirAFactura.mockRejectedValue({
      error: { message: 'Solo se pueden convertir presupuestos en estado Aceptado.' },
    });
    component.open('p1');
    component.serieId.set('s1');

    await component.onSubmit();

    expect(component.formError()).toBe('Solo se pueden convertir presupuestos en estado Aceptado.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/features/presupuestos/presupuestos.service.ts \
        frontend/src/app/features/presupuestos/presupuestos.service.spec.ts \
        frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts \
        frontend/src/app/features/presupuestos/convertir-a-factura-modal.html \
        frontend/src/app/features/presupuestos/convertir-a-factura-modal.css \
        frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts
git commit -m "feat(presupuestos): add convertirAFactura() and ConvertirAFacturaModal"
```

---

### Task 11: Frontend — wire "Convertir a factura" into the `Presupuestos` list

**Files:**
- Modify: `frontend/src/app/core/models/presupuesto.models.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.html`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.spec.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuesto-form-modal.spec.ts` (fixture shape only, see Step 1)

**Interfaces:**
- Consumes: `ConvertirAFacturaModal` (Task 10), backend `PresupuestoSummaryDto.FacturaId` (Task 3).
- Produces: nothing new consumed elsewhere — this is the final task.

- [ ] **Step 1: Add `facturaId` to `PresupuestoSummary` and fix existing fixtures**

In `frontend/src/app/core/models/presupuesto.models.ts`, update the interface:

```typescript
export interface PresupuestoSummary {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  numeroLineas: number;
  facturaId: string | null;
}
```

This breaks existing object literals typed as `PresupuestoSummary` that don't yet have `facturaId`. Fix them:

In `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts`, add `facturaId: null,` to the `summary1` object literal.

In `frontend/src/app/features/presupuestos/presupuestos.spec.ts`, add `facturaId: null,` to all three existing summary fixtures — `summaryBorrador`, `summaryEnviado`, AND `summaryAceptado` (the last one keeps `facturaId: null` because it must still be convertible). Then add a **new** fixture `summaryAceptadoConvertido` with `facturaId: 'f1'` (already converted, button must not show) — used in Step 4 below.

- [ ] **Step 2: Run the full frontend suite to verify these fixture edits alone don't break anything else**

Run: `cd frontend && npm test`
Expected: PASS (no behavior changed yet, only fixture shapes).

- [ ] **Step 3: Update `Presupuestos` component**

In `frontend/src/app/features/presupuestos/presupuestos.ts`, replace the full file:

```typescript
// frontend/src/app/features/presupuestos/presupuestos.ts
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import {
  EstadoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  PresupuestoSummary,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-presupuestos',
  imports: [PresupuestoFormModal, ConvertirAFacturaModal],
  templateUrl: './presupuestos.html',
  styleUrl: './presupuestos.css',
})
export class Presupuestos implements OnInit {
  protected readonly presupuestosService = inject(PresupuestosService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly seriesService = inject(SeriesService);
  private readonly router = inject(Router);
  protected readonly EstadoPresupuesto = EstadoPresupuesto;
  protected readonly ESTADO_PRESUPUESTO_LABELS = ESTADO_PRESUPUESTO_LABELS;

  @ViewChild(PresupuestoFormModal) modal!: PresupuestoFormModal;
  @ViewChild(ConvertirAFacturaModal) convertirModal!: ConvertirAFacturaModal;

  ngOnInit(): void {
    void this.presupuestosService.load();
    void this.clientesService.load();
    void this.seriesService.load();
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

  onConvertirAFactura(p: PresupuestoSummary): void {
    this.convertirModal.open(p.id);
  }

  onFacturaCreada(): void {
    void this.router.navigate(['/facturas']);
  }

  onSaved(): void {
    // No-op: PresupuestosService.create()/update() already reload the list
    // themselves, and the modal closes itself on success. Bound to (saved)
    // only so the modal's documented output has a consumer.
  }
}
```

- [ ] **Step 4: Write the failing tests for the new behavior**

Add to `frontend/src/app/features/presupuestos/presupuestos.spec.ts` — update the top-level imports to add `Router` and `ConvertirAFacturaModal`, add `facturaId: null` to `summaryBorrador`/`summaryEnviado`/`summaryAceptado`, add a new `summaryAceptadoConvertido` fixture, extend `makeStubs()`'s return to include a `seriesServiceStub`, wire a `routerStub` into `TestBed`, and assign `component.convertirModal` in `beforeEach`:

```typescript
import { Router } from '@angular/router';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';
```

```typescript
const summaryAceptadoConvertido: PresupuestoSummary = {
  id: 'p4',
  clienteId: 'c1',
  numero: 'PRE-2026-004',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: 'f1',
};

const serie1: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };
```

Add `facturaId: null` to the existing `summaryBorrador`, `summaryEnviado`, `summaryAceptado` literals, and extend `makeStubs()`:

```typescript
function makeStubs() {
  const presupuestosServiceStub = {
    presupuestos: signal<PresupuestoSummary[]>([
      summaryBorrador,
      summaryEnviado,
      summaryAceptado,
      summaryAceptadoConvertido,
    ]),
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
  const seriesServiceStub = {
    series: signal<Serie[]>([serie1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { presupuestosServiceStub, clientesServiceStub, seriesServiceStub };
}
```

In `beforeEach`, register `SeriesService`/`Router` and stub `convertirModal`:

```typescript
    const routerStub = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
        { provide: SeriesService, useValue: seriesServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });

    component = TestBed.createComponent(Presupuestos).componentInstance;
    component.convertirModal = { open: vi.fn() } as unknown as ConvertirAFacturaModal;
```

(The existing `component.modal = ...` assignment, if the current file stubs the dialog directly, stays as-is; otherwise `PresupuestoFormModal` is already exercised through the existing suite unchanged by this task.)

Add the new test cases:

```typescript
  it('ngOnInit() also loads series', () => {
    component.ngOnInit();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('onConvertirAFactura() opens the convertir modal with the presupuesto id', () => {
    component.onConvertirAFactura(summaryAceptado);
    expect(component.convertirModal.open).toHaveBeenCalledWith('p3');
  });

  it('onFacturaCreada() navigates to /facturas', () => {
    component.onFacturaCreada();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/facturas']);
  });
```

The existing `describe('template rendering', ...)` block (further down in the same file) renders the real `Presupuestos` component tree, including its real child components — which now include `ConvertirAFacturaModal` (injects `SeriesService`) and the `Presupuestos` component itself (now injects `Router` and `SeriesService` too). Its local `render()` helper rebuilds `TestBed` with its own provider list, separate from the outer `beforeEach`, so it needs the same additions. Update it:

```typescript
    function render() {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      TestBed.configureTestingModule({
        providers: [
          { provide: PresupuestosService, useValue: stubs.presupuestosServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
          { provide: SeriesService, useValue: stubs.seriesServiceStub },
          { provide: Router, useValue: { navigate: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(Presupuestos);
      fixture.detectChanges();
      return fixture;
    }
```

(apply the same provider additions to the second inline `TestBed.configureTestingModule` call inside `'shows the empty-state message when there are no presupuestos'`, which duplicates this setup instead of calling `render()`)

Since `makeStubs()` now seeds 4 rows instead of 3 (Step 1 added `summaryAceptadoConvertido`), update `'renders one row per presupuesto with the resolved cliente name'` to expect `4` instead of `3`. Replace `'shows no action buttons for Aceptado rows'` with two tests that reflect the new split behavior:

```typescript
    it('shows Convertir a factura only for Aceptado rows without a factura yet', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const aceptadoRow = rows[2] as HTMLElement;
      expect(aceptadoRow.textContent).toContain('Convertir a factura');
      expect(aceptadoRow.textContent).not.toContain('Editar');
      expect(aceptadoRow.textContent).not.toContain('Aceptar');
    });

    it('shows no action buttons for Aceptado rows already converted', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const convertidaRow = rows[3] as HTMLElement;
      expect(convertidaRow.textContent).not.toContain('Convertir a factura');
      expect(convertidaRow.textContent).not.toContain('Editar');
      expect(convertidaRow.textContent).not.toContain('Aceptar');
    });
```

- [ ] **Step 5: Run the tests to verify they fail appropriately**

Run: `cd frontend && npm test`
Expected: FAIL — `component.onConvertirAFactura`/`onFacturaCreada` don't exist yet, and `seriesServiceStub.load` was never called.

- [ ] **Step 6: Update the template**

In `frontend/src/app/features/presupuestos/presupuestos.html`, add the "Convertir a factura" branch to the actions cell and the new modal element:

```html
              } @else if (p.estado === EstadoPresupuesto.Aceptado && p.facturaId === null) {
                <button type="button" (click)="onConvertirAFactura(p)" class="text-slate-600 hover:underline">
                  Convertir a factura
                </button>
              }
```

(inserted as a new `@else if` branch right after the existing `Enviado` branch, before the closing `}` of the `@if` chain)

```html
  <app-presupuesto-form-modal (saved)="onSaved()" />
  <app-convertir-a-factura-modal (converted)="onFacturaCreada()" />
```

(the second line added right after the existing `<app-presupuesto-form-modal>` line)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 8: Run the full test suites one final time**

Run: `cd frontend && npm test`
Expected: all frontend tests pass (baseline 140 + new tests from Tasks 4-11).

Run: `cd backend && dotnet test`
Expected: all backend tests pass (baseline 44 + 6 new from Tasks 1-3 = 50).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core/models/presupuesto.models.ts \
        frontend/src/app/features/presupuestos/presupuestos.ts \
        frontend/src/app/features/presupuestos/presupuestos.html \
        frontend/src/app/features/presupuestos/presupuestos.spec.ts \
        frontend/src/app/features/presupuestos/presupuesto-form-modal.spec.ts
git commit -m "feat(presupuestos): wire convertir-a-factura button into the list"
```

---

## Final manual verification (after all tasks)

Follow the spec's checklist: start backend (`cd backend/LocaleBoost.Api && dotnet run --urls http://localhost:5091`) and frontend (`cd frontend && npm start`), then in the browser verify: empty state of `/facturas`; manual creation with mixed-IVA líneas and retención; cliente/serie/número/precio validations; marcar cobrada with a date; anular with confirmation; rectificar with preloaded líneas and partial edits; converting an `Aceptado` presupuesto to a factura from `/presupuestos` and confirming it navigates to `/facturas` with the button now gone from that presupuesto's row; a factura with `presupuestoOrigenId` or `facturaRectificadaId` shows the provenance note in its detail modal.
