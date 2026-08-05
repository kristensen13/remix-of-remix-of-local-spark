# Fix report: PUT /api/presupuestos/{id} DbUpdateConcurrencyException

## What was found

Read `backend/LocaleBoost.Api/Controllers/PresupuestosController.cs` (`Update`, lines 102-139
before the fix), `backend/LocaleBoost.Api/Data/Entities/LineaPresupuesto.cs`, and
`backend/LocaleBoost.Api/Data/AppDbContext.cs` (`OnModelCreating`, the
`Presupuesto.Lineas` / `LineaPresupuesto` relationship configuration around lines 89-93).
The diagnosis in the task brief matched exactly:

- `LineaPresupuesto.Id` is a plain `Guid` with no `[DatabaseGenerated]` /
  `ValueGeneratedNever()` configuration — EF Core treats a non-CLR-default key value on an
  entity reached only via navigation-property assignment as "already exists, update it".
- `Update()` loads `presupuesto` via `.Include(p => p.Lineas)` (already tracked), then does
  `_db.LineasPresupuesto.RemoveRange(presupuesto.Lineas)` followed by assigning a brand-new
  `List<LineaPresupuesto>` (each with `Id = Guid.NewGuid()`) directly to the
  `presupuesto.Lineas` navigation property — never calling `Add`/`AddRange` on the `DbSet`.
  EF's change-tracker fixup infers `EntityState.Modified` for these new rows instead of
  `EntityState.Added`.
- `Create()` doesn't hit this because the whole `Presupuesto` graph (including nested
  `Lineas`) is new and reached via `_db.Presupuestos.Add(presupuesto)`, which recursively
  marks every entity in a freshly-added graph as `Added` regardless of key values.

## RED — failing test written first

Created `backend/LocaleBoost.Api.Tests/IntegrationTests/PresupuestosControllerTests.cs`
(first Presupuestos-specific backend test), following the `BusinessesControllerTests.cs`
pattern: `IClassFixture<CustomWebApplicationFactory>` (real Postgres via Testcontainers +
real EF Core migrations), a `CreateAuthenticatedClientAsync()` helper (InviteCode → register
→ Bearer token), a `CreateClienteAsync()` helper via the real Clientes API, then:

1. `POST /api/presupuestos` with one línea → 201, capture the created `PresupuestoDto`.
2. `PUT /api/presupuestos/{id}` with a **different** set of líneas (2 líneas, different
   content, tipo, cantidad, precio, IVA, and count vs. the original 1 línea).
3. Assert `200 OK` on the update response.
4. Assert the returned DTO's líneas reflect the new content (count, descripción, cantidad,
   precioUnitario, tipoIva).
5. Re-fetch the presupuesto directly from `AppDbContext` in a fresh scope and assert the
   same, to catch a fix that silently swallows the update.

Ran against the **unfixed** code first:

```
dotnet test LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj \
  --filter "FullyQualifiedName~PresupuestosControllerTests"
```

Result: **FAIL**, 500 Internal Server Error.

SQL captured in the EF Core logs confirms the exact mechanism: after `Create` correctly
issues a single `INSERT`, the `Update` call issued:

```sql
DELETE FROM "LineasPresupuesto" WHERE "Id" = @p0;
UPDATE "LineasPresupuesto" SET "Cantidad" = @p1, ... WHERE "Id" = @p8;   -- 0 rows affected, new GUID
UPDATE "LineasPresupuesto" SET "Cantidad" = @p9, ... WHERE "Id" = @p16;  -- 0 rows affected, new GUID
UPDATE "Presupuestos" SET "FechaValidez" = @p17, ... WHERE "Id" = @p20;
```

and threw:

```
Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException: The database operation was
expected to affect 1 row(s), but actually affected 0 row(s); data may have been modified
or deleted since entities were loaded.
   at ... NpgsqlModificationCommandBatch.ThrowAggregateUpdateConcurrencyExceptionAsync(...)
   at ... LocaleBoost.Api.Controllers.PresupuestosController.Update(Guid id, UpdatePresupuestoRequest request)
     in .../Controllers/PresupuestosController.cs:line 136
```

xUnit output: `Expected 200 OK but got 500 InternalServerError` — confirming RED and that
the test reproduces the real bug end-to-end (real Postgres, real controller, real EF Core
change tracker), not a mock artifact.

## The fix

`backend/LocaleBoost.Api/Controllers/PresupuestosController.cs`, `Update()` method: after
`_db.LineasPresupuesto.RemoveRange(presupuesto.Lineas)`, the new líneas are now built into a
local variable and explicitly `AddRange`-ed to the `LineasPresupuesto` `DbSet` **before**
being assigned to the navigation property, so EF Core is told unambiguously they are new
rows regardless of their (non-default) `Id` value:

```csharp
_db.LineasPresupuesto.RemoveRange(presupuesto.Lineas);

var nuevasLineas = request.Lineas.Select(l => new LineaPresupuesto
{
    Id = Guid.NewGuid(),
    PresupuestoId = presupuesto.Id,
    Tipo = l.Tipo,
    Descripcion = l.Descripcion,
    Cantidad = l.Cantidad,
    PrecioUnitario = l.PrecioUnitario,
    TipoIva = l.TipoIva,
    Orden = l.Orden
}).ToList();

// Se añaden explícitamente al DbSet para que EF Core las marque como Added:
// al asignarlas solo a la propiedad de navegación, el change tracker las
// infiere como Modified (por tener una Id no-default), generando UPDATEs
// sobre filas que aún no existen y disparando DbUpdateConcurrencyException.
_db.LineasPresupuesto.AddRange(nuevasLineas);
presupuesto.Lineas = nuevasLineas;

await _db.SaveChangesAsync();
```

Scope: only `Update()` was touched. `Create()`, `CambiarEstado()`, `ConvertirAFactura()`,
`GetAll()`, `GetById()` are untouched. No migrations or schema changes. No changes under
`frontend/`.

## GREEN

Re-ran the same filtered test after the fix:

```
dotnet test LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj \
  --filter "FullyQualifiedName~PresupuestosControllerTests"
```

Result: **PASS** (1/1). EF Core logs now show the correct statement shape:

```sql
DELETE FROM "LineasPresupuesto" WHERE "Id" = @p0;
UPDATE "Presupuestos" SET "FechaValidez" = @p1, "Notas" = @p2, "UpdatedAt" = @p3 WHERE "Id" = @p4;
INSERT INTO "LineasPresupuesto" ("Id", "Cantidad", "Descripcion", "Orden", "PrecioUnitario", "PresupuestoId", "Tipo", "TipoIva")
  VALUES (@p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12);
INSERT INTO "LineasPresupuesto" ("Id", "Cantidad", "Descripcion", "Orden", "PrecioUnitario", "PresupuestoId", "Tipo", "TipoIva")
  VALUES (@p13, @p14, @p15, @p16, @p17, @p18, @p19, @p20);
```

```
Correctas LocaleBoost.Api.Tests.IntegrationTests.PresupuestosControllerTests.Update_WithChangedLineas_ReturnsOkAndPersistsNewLineas [599 ms]
Pruebas totales: 1
     Correcto: 1
```

## Full suite — no regressions

```
dotnet test LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj
```

```
Pruebas totales: 44
     Correcto: 44
 Tiempo total: 8,5003 Segundos
```

All 44 backend tests pass (43 pre-existing + the 1 new integration test), including the
full `IntegrationTests` and `UnitTests` suites (Auth, Businesses, BusinessSearchHistory,
Websites, EntityPersistence, HealthCheck, StartupMigration, StaticFileFallback, plus the
unit tests for ClaudeService, ExceptionHandlingMiddleware, GoogleMapsService,
WebsiteFetcherService).

## Files changed

- `backend/LocaleBoost.Api/Controllers/PresupuestosController.cs` — the fix (9 insertions,
  1 deletion in `Update()`).
- `backend/LocaleBoost.Api.Tests/IntegrationTests/PresupuestosControllerTests.cs` — new
  file, the failing-then-passing integration test.

## Commits

See `git log` on branch `fix/presupuestos-update-concurrency` for the commit hash(es).
