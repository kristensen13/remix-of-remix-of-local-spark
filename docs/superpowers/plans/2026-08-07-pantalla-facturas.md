# Pantalla de Facturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Facturas screen (read-only list + "marcar cobrada") in the Angular frontend, plus the "convertir a factura" flow on the existing Presupuestos screen, backed by two small necessary backend fixes.

**Architecture:** Two backend fixes close gaps found while reading the existing `FacturasController`/`PresupuestosController` (a `FechaCobro` value that was silently discarded, and a `FacturaId` missing from the Presupuestos summary DTO). On top of that, a new `FacturasService` + `Facturas` list component + `MarcarCobradaModal` form the read-only Facturas screen (new route `/facturas`), mirroring the Series screen's "list only, no edit" shape. A new `ConvertirAFacturaModal`, added to the existing `features/presupuestos/` folder (not to `features/facturas/`, since it acts on a Presupuesto), lets the user pick a `Serie` + optional IRPF % to turn an `Aceptado` presupuesto into a `Factura`.

**Tech Stack:** .NET 8 / EF Core / Npgsql (backend), Angular 22 standalone components, signals, `output()`, `FormsModule`/`ngModel`, Tailwind utility classes, Vitest (`@angular/build:unit-test`), xUnit + Testcontainers Postgres (backend tests).

**Spec:** `docs/superpowers/specs/2026-08-07-pantalla-facturas-design.md`

## Global Constraints

- Comunicación y todo texto de UI/comentarios/mensajes de commit: castellano de España.
- Patrón fecha-como-instante-UTC obligatorio para todo campo `date`→`timestamptz`: `` fecha ? `${fecha}T00:00:00Z` : null `` (o, si el campo es obligatorio como `FechaCobro`, bloquear el submit en vez de enviar `null`).
- Validación de rango/coerción explícita para campos numéricos: Angular emite `null` (no `NaN`) al vaciar un `<input type="number">`.
- Componentes nuevos usan `output()` nativo de Angular (no `@Output()`/`EventEmitter`).
- El componente de listado inyecta y expone el servicio completo al template: `protected readonly xxxService = inject(...)`.
- Un signal por campo de formulario en los modales.
- HTTP vía `HttpClient` + `firstValueFrom` (no `.subscribe()`). Errores formateados con `extractErrorMessage()` de `core/http-error.util.ts` — no modificar ese archivo.
- Formularios con `FormsModule` + `[ngModel]`/`(ngModelChange)`, nunca Reactive Forms.
- jsdom en este proyecto no implementa `HTMLDialogElement.showModal()`/`close()` — todo componente con `<dialog>` expone su `ElementRef` como `@ViewChild` no-privado para que los tests lo reemplacen por `{ nativeElement: { showModal: vi.fn(), close: vi.fn() } }`.
- Los tests de componente no llaman a `fixture.detectChanges()` salvo en los bloques "template rendering" que renderizan el DOM real a propósito.
- Todos los endpoints backend ya están bajo `[Authorize]` + filtrado por `CurrentUserId` — no tocar esa capa de seguridad ni añadir endpoints nuevos sin esa protección.
- No hay alta/edición/borrado manual de Facturas — nacen solo vía `POST /api/presupuestos/{id}/convertir-a-factura` o `POST /api/facturas/{id}/rectificar` (rectificar queda fuera de este plan).
- Fuera de alcance de este plan: botón de Anular, botón de Rectificar, generación de PDF, filtros de listado por cliente/estado.
- Backend: tests de integración con xUnit + Testcontainers Postgres vía `CustomWebApplicationFactory` (Docker debe estar corriendo). Ejecutar desde `backend/LocaleBoost.Api.Tests/` con `dotnet test`. Baseline confirmado antes de este plan: 44 tests pasando.
- Frontend: ejecutar desde `frontend/` con `npm test` (corre una vez, no en watch mode). Baseline confirmado antes de este plan: 23 archivos / 140 tests pasando.
- Migraciones EF Core se generan con `dotnet ef migrations add <Nombre>` desde `backend/LocaleBoost.Api/` y se aplican solas al arrancar (`Program.cs` llama a `db.Database.MigrateAsync()`), no hace falta `dotnet ef database update` manual para el flujo normal.

---

### Task 1: Backend — persistir FechaCobro y exponer FacturaId en el summary de Presupuestos

**Files:**
- Modify: `backend/LocaleBoost.Api/Data/Entities/Factura.cs`
- Modify: `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/FacturasController.cs`
- Modify: `backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs`
- Create: `backend/LocaleBoost.Api/Migrations/<timestamp>_AddFacturaFechaCobro.cs` (generado por `dotnet ef migrations add`)
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs`

**Interfaces:**
- Consumes: `AppDbContext`, `IFacturacionCalculoService` (ya existentes, sin cambios), `CustomWebApplicationFactory` (harness de test ya existente).
- Produces (usado por los Tasks 2-5 solo como contrato HTTP, no como código TS compartido):
  - `GET /api/facturas` → cada item de `FacturaSummaryDto` sigue igual (`Id, ClienteId, NumeroCompleto, Estado, FechaEmision, Total`), sin cambios.
  - `POST /api/facturas/{id}/marcar-cobrada` con body `{ fechaCobro: string }` (instante UTC) → persiste de verdad `Factura.FechaCobro`.
  - `GET /api/presupuestos` → cada item de `PresupuestoSummaryDto` gana `facturaId: string | null`.

- [ ] **Step 1: Añadir el campo a la entidad**

Editar `backend/LocaleBoost.Api/Data/Entities/Factura.cs`, añadiendo `FechaCobro` justo después de `FechaVencimiento`:

```csharp
    public DateTime FechaEmision { get; set; }
    public DateTime? FechaVencimiento { get; set; }
    public DateTime? FechaCobro { get; set; }
    public decimal? PorcentajeRetencionIrpf { get; set; }
```

- [ ] **Step 2: Generar la migración**

Run (desde `backend/LocaleBoost.Api/`): `dotnet ef migrations add AddFacturaFechaCobro`
Expected: crea `Migrations/<timestamp>_AddFacturaFechaCobro.cs` y actualiza `Migrations/AppDbContextModelSnapshot.cs`, añadiendo una columna `FechaCobro` de tipo `timestamp with time zone`, nullable, a la tabla `Facturas`. Revisar el archivo generado — debe contener únicamente un `AddColumn`/`DropColumn` para `FechaCobro`, nada más.

- [ ] **Step 3: Persistir FechaCobro en el DTO de factura**

Editar `backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs`. El record `FacturaDto` gana `FechaCobro` justo después de `FechaVencimiento`:

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

Y `FacturaMappingExtensions.ToDto` pasa a incluirlo:

```csharp
public static class FacturaMappingExtensions
{
    public static FacturaDto ToDto(this Factura f) => new(
        f.Id, f.ClienteId, f.SerieId, f.NumeroCompleto, f.Estado, f.FechaEmision, f.FechaVencimiento, f.FechaCobro,
        f.PorcentajeRetencionIrpf, f.BaseImponible, f.TotalIva, f.TotalRetencion, f.Total,
        f.PresupuestoOrigenId, f.FacturaRectificadaId, f.PdfUrl,
        f.Lineas.OrderBy(l => l.Orden)
            .Select(l => new LineaFacturaDto(l.Id, l.Tipo, l.Descripcion, l.Cantidad, l.PrecioUnitario, l.TipoIva, l.Orden))
            .ToList(),
        f.CreatedAt);

    public static FacturaSummaryDto ToSummaryDto(this Factura f) => new(
        f.Id, f.ClienteId, f.NumeroCompleto, f.Estado, f.FechaEmision, f.Total);
}
```

- [ ] **Step 4: Guardar FechaCobro en MarcarCobrada**

En `backend/LocaleBoost.Api/Controllers/FacturasController.cs`, dentro del método `MarcarCobrada`, cambiar:

```csharp
        factura.Estado = EstadoFactura.Cobrada;
        await _db.SaveChangesAsync();
```

por:

```csharp
        factura.FechaCobro = request.FechaCobro;
        factura.Estado = EstadoFactura.Cobrada;
        await _db.SaveChangesAsync();
```

- [ ] **Step 5: Exponer FacturaId en el summary de Presupuestos**

En `backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs`, cambiar:

```csharp
public record PresupuestoSummaryDto(
    Guid Id, Guid ClienteId, string Numero, EstadoPresupuesto Estado, DateTime FechaEmision, int NumeroLineas);
```

por:

```csharp
public record PresupuestoSummaryDto(
    Guid Id, Guid ClienteId, string Numero, EstadoPresupuesto Estado, DateTime FechaEmision, int NumeroLineas, Guid? FacturaId);
```

Y en `PresupuestoMappingExtensions`, cambiar:

```csharp
    public static PresupuestoSummaryDto ToSummaryDto(this Presupuesto p) => new(
        p.Id, p.ClienteId, p.Numero, p.Estado, p.FechaEmision, p.Lineas.Count);
```

por:

```csharp
    public static PresupuestoSummaryDto ToSummaryDto(this Presupuesto p) => new(
        p.Id, p.ClienteId, p.Numero, p.Estado, p.FechaEmision, p.Lineas.Count, p.FacturaId);
```

- [ ] **Step 6: Escribir el test de integración (falla primero)**

Crear `backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs`:

```csharp
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
            "Cliente de prueba",
            "12345678Z",
            "Calle Falsa 123",
            "28080",
            "Madrid",
            "Madrid",
            "España",
            "cliente@test.com",
            "600000000",
            false);

        var response = await client.PostAsJsonAsync("/api/clientes", request);
        response.EnsureSuccessStatusCode();
        var cliente = await response.Content.ReadFromJsonAsync<ClienteDto>();
        return cliente!.Id;
    }

    private async Task<Guid> CreateSerieAsync(HttpClient client)
    {
        var request = new CreateSerieRequest("FAC", "Serie de prueba", DateTime.UtcNow.Year, false);
        var response = await client.PostAsJsonAsync("/api/series", request);
        response.EnsureSuccessStatusCode();
        var serie = await response.Content.ReadFromJsonAsync<SerieDto>();
        return serie!.Id;
    }

    [Fact]
    public async Task ConvertirAFactura_ThenMarcarCobrada_ExponeFacturaIdEnSummaryYPersisteFechaCobro()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);
        var serieId = await CreateSerieAsync(client);

        var createRequest = new CreatePresupuestoRequest(
            clienteId,
            "PRES-0001",
            null,
            null,
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Consultoría", 10m, 100m, TipoIva.General21, 0)
            });
        var createResponse = await client.PostAsJsonAsync("/api/presupuestos", createRequest);
        createResponse.EnsureSuccessStatusCode();
        var presupuesto = await createResponse.Content.ReadFromJsonAsync<PresupuestoDto>();

        var aceptarResponse = await client.PostAsJsonAsync(
            $"/api/presupuestos/{presupuesto!.Id}/estado",
            new CambiarEstadoPresupuestoRequest(EstadoPresupuesto.Aceptado));
        aceptarResponse.EnsureSuccessStatusCode();

        // Antes de convertir, el summary no debe tener FacturaId.
        var summaryAntesResponse = await client.GetAsync("/api/presupuestos");
        var summaryAntes = await summaryAntesResponse.Content.ReadFromJsonAsync<List<PresupuestoSummaryDto>>();
        Assert.Null(summaryAntes!.Single(p => p.Id == presupuesto.Id).FacturaId);

        var convertirResponse = await client.PostAsJsonAsync(
            $"/api/presupuestos/{presupuesto.Id}/convertir-a-factura",
            new ConvertirAFacturaRequest(serieId, 15m));
        var convertirBody = await convertirResponse.Content.ReadAsStringAsync();
        Assert.True(
            convertirResponse.StatusCode == HttpStatusCode.OK,
            $"Expected 200 OK but got {(int)convertirResponse.StatusCode}. Body: {convertirBody}");
        var factura = await convertirResponse.Content.ReadFromJsonAsync<FacturaDto>();
        Assert.NotNull(factura);

        // Tras convertir, el summary de Presupuestos debe exponer el FacturaId nuevo.
        var summaryDespuesResponse = await client.GetAsync("/api/presupuestos");
        var summaryDespues = await summaryDespuesResponse.Content.ReadFromJsonAsync<List<PresupuestoSummaryDto>>();
        Assert.Equal(factura!.Id, summaryDespues!.Single(p => p.Id == presupuesto.Id).FacturaId);

        var fechaCobro = new DateTime(2026, 8, 10, 0, 0, 0, DateTimeKind.Utc);
        var marcarCobradaResponse = await client.PostAsJsonAsync(
            $"/api/facturas/{factura.Id}/marcar-cobrada",
            new MarcarCobradaRequest(fechaCobro));
        marcarCobradaResponse.EnsureSuccessStatusCode();

        // Confirmamos contra la base de datos real que FechaCobro se persistió
        // (antes de este fix, el controller lo descartaba en silencio).
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var facturaPersistida = await db.Facturas.SingleAsync(f => f.Id == factura.Id);

        Assert.Equal(EstadoFactura.Cobrada, facturaPersistida.Estado);
        Assert.Equal(fechaCobro, facturaPersistida.FechaCobro);
    }
}
```

Run (desde `backend/LocaleBoost.Api.Tests/`): `dotnet test --filter FullyQualifiedName~FacturasControllerTests`
Expected: FAIL — antes de los Steps 1-5 esto no compila (`FechaCobro`, `FacturaId` no existen todavía). Si ya aplicaste los Steps 1-5 antes de este paso, este test debería compilar y pasar directamente; en ese caso, revertir mentalmente el Step 4 (comentar la línea `factura.FechaCobro = request.FechaCobro;`) y confirmar que el test falla en el último `Assert.Equal(fechaCobro, facturaPersistida.FechaCobro)` antes de restaurarla, para verificar que el test realmente cubre el bug.

- [ ] **Step 7: Ejecutar todos los tests backend y confirmar que pasan**

Run (desde `backend/LocaleBoost.Api.Tests/`): `dotnet test`
Expected: PASS — 45 tests (44 existentes + 1 nuevo), sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add backend/LocaleBoost.Api/Data/Entities/Factura.cs \
  backend/LocaleBoost.Api/Dtos/Facturas/FacturaDtos.cs \
  backend/LocaleBoost.Api/Controllers/FacturasController.cs \
  backend/LocaleBoost.Api/Dtos/Presupuestos/PresupuestoDtos.cs \
  backend/LocaleBoost.Api/Migrations/ \
  backend/LocaleBoost.Api.Tests/IntegrationTests/FacturasControllerTests.cs
git commit -m "fix(backend): persiste FechaCobro y expone FacturaId en el summary de Presupuestos"
```

---

### Task 2: Frontend — modelos y FacturasService

**Files:**
- Create: `frontend/src/app/core/models/factura.models.ts`
- Create: `frontend/src/app/features/facturas/facturas.service.ts`
- Test: `frontend/src/app/features/facturas/facturas.service.spec.ts`

**Interfaces:**
- Consumes: `HttpClient`, `extractErrorMessage` de `core/http-error.util.ts` (sin cambios).
- Produces (usado por el Task 3):
  - `EstadoFactura` — enum numérico `Emitida, Cobrada, Anulada, Rectificada` (mismo orden que `FacturacionEnums.cs`).
  - `ESTADO_FACTURA_LABELS` — `Record<EstadoFactura, string>`.
  - `FacturaSummary` — `{ id: string; clienteId: string; numeroCompleto: string; estado: EstadoFactura; fechaEmision: string; total: number }`.
  - `MarcarCobradaRequest` — `{ fechaCobro: string }`.
  - `FacturasService` — `facturas: Signal<FacturaSummary[]>`, `isLoading: Signal<boolean>`, `errorMessage: Signal<string | null>`, `load(): Promise<void>`, `marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void>`.

- [ ] **Step 1: Escribir el archivo de modelos**

Crear `frontend/src/app/core/models/factura.models.ts`:

```typescript
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

export interface FacturaSummary {
  id: string;
  clienteId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  total: number;
}

export interface MarcarCobradaRequest {
  fechaCobro: string;
}
```

- [ ] **Step 2: Escribir los tests de FacturasService (fallan primero)**

Crear `frontend/src/app/features/facturas/facturas.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturasService } from './facturas.service';
import { EstadoFactura, FacturaSummary } from '../../core/models/factura.models';

const factura1: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 1210,
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

  it('loads facturas on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush([factura1]);
    await loadPromise;

    expect(service.facturas()).toEqual([factura1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('marcarCobrada() posts the request and reloads the list', async () => {
    const marcarPromise = service.marcarCobrada('f1', { fechaCobro: '2026-08-10T00:00:00Z' });

    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST',
    );
    expect(postReq.request.body).toEqual({ fechaCobro: '2026-08-10T00:00:00Z' });
    postReq.flush({});

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([factura1]);

    await marcarPromise;
    expect(service.facturas()).toEqual([factura1]);
  });

  it('marcarCobrada() rejects and does not reload the list on conflict', async () => {
    const marcarPromise = service.marcarCobrada('f1', { fechaCobro: '2026-08-10T00:00:00Z' });
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST',
    );
    postReq.flush(
      { message: 'Solo se pueden marcar como cobradas facturas en estado Emitida.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(marcarPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/facturas' && r.method === 'GET')).toHaveLength(0);
  });
});
```

Run (desde `frontend/`): `npm test`
Expected: FAIL — `facturas.service.ts` no existe todavía (module not found).

- [ ] **Step 3: Implementar FacturasService**

Crear `frontend/src/app/features/facturas/facturas.service.ts`:

```typescript
import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FacturaSummary, MarcarCobradaRequest } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class FacturasService {
  private readonly http = inject(HttpClient);

  readonly facturas = signal<FacturaSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const facturas = await firstValueFrom(this.http.get<FacturaSummary[]>('/api/facturas'));
      this.facturas.set(facturas);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void> {
    await firstValueFrom(this.http.post(`/api/facturas/${id}/marcar-cobrada`, request));
    await this.load();
  }
}
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — todos los tests de `FacturasService` en verde, sin regresiones en los 140 existentes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/models/factura.models.ts \
  frontend/src/app/features/facturas/facturas.service.ts \
  frontend/src/app/features/facturas/facturas.service.spec.ts
git commit -m "feat(facturas): add Factura models and FacturasService"
```

---

### Task 3: Frontend — pantalla de Facturas, modal "marcar cobrada", ruta y nav

**Files:**
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.ts`
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.html`
- Create: `frontend/src/app/features/facturas/marcar-cobrada-modal.css`
- Test: `frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts`
- Create: `frontend/src/app/features/facturas/facturas.ts`
- Create: `frontend/src/app/features/facturas/facturas.html`
- Create: `frontend/src/app/features/facturas/facturas.css`
- Test: `frontend/src/app/features/facturas/facturas.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/layout/layout.html`

**Interfaces:**
- Consumes: `FacturasService`, `FacturaSummary`, `EstadoFactura`, `ESTADO_FACTURA_LABELS`, `MarcarCobradaRequest` (Task 2); `ClientesService` (ya existente, sin cambios).
- Produces: nada consumido por tasks posteriores — esta es la última pieza del módulo de Facturas en sí.

- [ ] **Step 1: Escribir los tests de MarcarCobradaModal (fallan primero)**

Crear `frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { FacturasService } from './facturas.service';

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('MarcarCobradaModal', () => {
  let component: MarcarCobradaModal;
  let facturasServiceStub: { marcarCobrada: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    facturasServiceStub = {
      marcarCobrada: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: FacturasService, useValue: facturasServiceStub }],
    });

    component = TestBed.createComponent(MarcarCobradaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() sets the número, defaults fechaCobro to today, and shows the dialog', () => {
    component.open('f1', 'FAC-2026-00001');

    expect(component.numeroCompleto).toBe('FAC-2026-00001');
    expect(component.fechaCobro()).toBe(new Date().toISOString().slice(0, 10));
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when fechaCobro is cleared', async () => {
    component.open('f1', 'FAC-2026-00001');
    component.fechaCobro.set('');

    await component.onSubmit();

    expect(component.formError()).toBe('La fecha de cobro es obligatoria.');
    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });

  it('onSubmit() calls marcarCobrada() with the UTC-instant date, closes the dialog, and emits saved', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);
    component.open('f1', 'FAC-2026-00001');
    component.fechaCobro.set('2026-08-10');

    await component.onSubmit();

    expect(facturasServiceStub.marcarCobrada).toHaveBeenCalledWith('f1', { fechaCobro: '2026-08-10T00:00:00Z' });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    facturasServiceStub.marcarCobrada.mockRejectedValue({
      error: { message: 'Solo se pueden marcar como cobradas facturas en estado Emitida.' },
    });
    component.open('f1', 'FAC-2026-00001');
    component.fechaCobro.set('2026-08-10');

    await component.onSubmit();

    expect(component.formError()).toBe('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

Run (desde `frontend/`): `npm test`
Expected: FAIL — `marcar-cobrada-modal.ts` no existe todavía.

- [ ] **Step 2: Implementar MarcarCobradaModal**

Crear `frontend/src/app/features/facturas/marcar-cobrada-modal.ts`:

```typescript
import { Component, ElementRef, ViewChild, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { extractErrorMessage } from '../../core/http-error.util';

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fechaCobro = signal(hoyIso());

  private facturaId = '';
  protected numeroCompleto = '';

  open(facturaId: string, numeroCompleto: string): void {
    this.facturaId = facturaId;
    this.numeroCompleto = numeroCompleto;
    this.fechaCobro.set(hoyIso());
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const fecha = this.fechaCobro();
    if (!fecha) {
      this.formError.set('La fecha de cobro es obligatoria.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      await this.facturasService.marcarCobrada(this.facturaId, { fechaCobro: `${fecha}T00:00:00Z` });
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

Crear `frontend/src/app/features/facturas/marcar-cobrada-modal.html`:

```html
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Marcar factura {{ numeroCompleto }} como cobrada</h2>

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
        {{ isSaving() ? 'Guardando…' : 'Confirmar cobro' }}
      </button>
    </div>
  </form>
</dialog>
```

Crear `frontend/src/app/features/facturas/marcar-cobrada-modal.css`:

```css
/* Marcar cobrada modal styles */
```

- [ ] **Step 3: Ejecutar los tests del modal y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — todos los tests de `MarcarCobradaModal` en verde, sin regresiones.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/facturas/marcar-cobrada-modal.ts \
  frontend/src/app/features/facturas/marcar-cobrada-modal.html \
  frontend/src/app/features/facturas/marcar-cobrada-modal.css \
  frontend/src/app/features/facturas/marcar-cobrada-modal.spec.ts
git commit -m "feat(facturas): add MarcarCobradaModal component"
```

- [ ] **Step 5: Escribir los tests del componente Facturas (fallan primero)**

Crear `frontend/src/app/features/facturas/facturas.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Facturas } from './facturas';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { Cliente } from '../../core/models/cliente.models';
import { EstadoFactura, FacturaSummary } from '../../core/models/factura.models';

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

const facturaEmitida: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 1210,
};

const facturaCobrada: FacturaSummary = {
  id: 'f2',
  clienteId: 'desconocido',
  numeroCompleto: 'FAC-2026-00002',
  estado: EstadoFactura.Cobrada,
  fechaEmision: '2026-08-02T00:00:00Z',
  total: 500,
};

function makeStubs() {
  const facturasServiceStub = {
    facturas: signal<FacturaSummary[]>([facturaEmitida, facturaCobrada]),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    load: vi.fn().mockResolvedValue(undefined),
  };
  const clientesServiceStub = {
    clientes: signal<Cliente[]>([cliente1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { facturasServiceStub, clientesServiceStub };
}

describe('Facturas', () => {
  let component: Facturas;
  let facturasServiceStub: ReturnType<typeof makeStubs>['facturasServiceStub'];
  let clientesServiceStub: ReturnType<typeof makeStubs>['clientesServiceStub'];
  let modalStub: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const stubs = makeStubs();
    facturasServiceStub = stubs.facturasServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    modalStub = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
      ],
    });

    component = TestBed.createComponent(Facturas).componentInstance;
    component.modal = modalStub as unknown as MarcarCobradaModal;
  });

  it('ngOnInit() loads facturas and clientes', () => {
    component.ngOnInit();
    expect(facturasServiceStub.load).toHaveBeenCalled();
    expect(clientesServiceStub.load).toHaveBeenCalled();
  });

  it('nombreCliente() resolves the cliente name or a fallback', () => {
    expect(component.nombreCliente('c1')).toBe('Acme SL');
    expect(component.nombreCliente('desconocido')).toBe('—');
  });

  it('onMarcarCobrada() opens the modal with the factura id and número', () => {
    component.onMarcarCobrada(facturaEmitida);
    expect(modalStub.open).toHaveBeenCalledWith('f1', 'FAC-2026-00001');
  });

  describe('template rendering', () => {
    function render() {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      TestBed.configureTestingModule({
        providers: [
          { provide: FacturasService, useValue: stubs.facturasServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(Facturas);
      fixture.detectChanges();
      return fixture;
    }

    it('renders one row per factura with the resolved cliente name', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('FAC-2026-00001');
      expect(text).toContain('Acme SL');
    });

    it('shows "Marcar cobrada" only for facturas in estado Emitida', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect((rows[0] as HTMLElement).textContent).toContain('Marcar cobrada');
      expect((rows[1] as HTMLElement).textContent).not.toContain('Marcar cobrada');
    });

    it('shows the empty-state message when there are no facturas', () => {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      stubs.facturasServiceStub.facturas.set([]);
      TestBed.configureTestingModule({
        providers: [
          { provide: FacturasService, useValue: stubs.facturasServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(Facturas);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay facturas — se generan al convertir un presupuesto aceptado.');
    });
  });
});
```

Run (desde `frontend/`): `npm test`
Expected: FAIL — `facturas.ts` no existe todavía.

- [ ] **Step 6: Implementar el componente Facturas**

Crear `frontend/src/app/features/facturas/facturas.ts`:

```typescript
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { EstadoFactura, ESTADO_FACTURA_LABELS, FacturaSummary } from '../../core/models/factura.models';

@Component({
  selector: 'app-facturas',
  imports: [MarcarCobradaModal],
  templateUrl: './facturas.html',
  styleUrl: './facturas.css',
})
export class Facturas implements OnInit {
  protected readonly facturasService = inject(FacturasService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly EstadoFactura = EstadoFactura;
  protected readonly ESTADO_FACTURA_LABELS = ESTADO_FACTURA_LABELS;

  @ViewChild(MarcarCobradaModal) modal!: MarcarCobradaModal;

  ngOnInit(): void {
    void this.facturasService.load();
    void this.clientesService.load();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }

  onMarcarCobrada(f: FacturaSummary): void {
    this.modal.open(f.id, f.numeroCompleto);
  }

  onSaved(): void {
    // No-op: FacturasService.marcarCobrada() ya recarga la lista por su cuenta,
    // y el modal se cierra solo al terminar. Enlazado a (saved) solo para que
    // el output documentado del modal tenga un consumidor.
  }
}
```

Crear `frontend/src/app/features/facturas/facturas.html`:

```html
<div class="mx-auto max-w-5xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Facturas</h1>
  </div>

  @if (facturasService.errorMessage()) {
    <p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ facturasService.errorMessage() }}</p>
  }

  @if (facturasService.isLoading()) {
    <p class="text-sm text-slate-500">Cargando…</p>
  } @else if (facturasService.facturas().length > 0) {
    <table class="w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Número</th>
          <th class="py-2">Cliente</th>
          <th class="py-2">Fecha emisión</th>
          <th class="py-2">Total</th>
          <th class="py-2">Estado</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (f of facturasService.facturas(); track f.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2">{{ f.numeroCompleto }}</td>
            <td class="py-2">{{ nombreCliente(f.clienteId) }}</td>
            <td class="py-2">{{ formatFecha(f.fechaEmision) }}</td>
            <td class="py-2">{{ f.total.toFixed(2) }} €</td>
            <td class="py-2">{{ ESTADO_FACTURA_LABELS[f.estado] }}</td>
            <td class="py-2 text-right">
              @if (f.estado === EstadoFactura.Emitida) {
                <button type="button" (click)="onMarcarCobrada(f)" class="text-slate-600 hover:underline">
                  Marcar cobrada
                </button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  } @else {
    <p class="text-sm text-slate-500">Todavía no hay facturas — se generan al convertir un presupuesto aceptado.</p>
  }

  <app-marcar-cobrada-modal (saved)="onSaved()" />
</div>
```

Crear `frontend/src/app/features/facturas/facturas.css`:

```css
/* Facturas list styles */
```

- [ ] **Step 7: Añadir la ruta y el enlace de navegación**

En `frontend/src/app/app.routes.ts`, añadir el import y la ruta:

```typescript
import { Presupuestos } from './features/presupuestos/presupuestos';
import { Facturas } from './features/facturas/facturas';
```

```typescript
      { path: 'presupuestos', component: Presupuestos },
      { path: 'facturas', component: Facturas },
      { path: '', pathMatch: 'full', redirectTo: 'search' },
```

En `frontend/src/app/shared/layout/layout.html`, añadir el enlace justo después del de Presupuestos:

```html
      <a routerLink="/presupuestos" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Presupuestos
      </a>
      <a routerLink="/facturas" routerLinkActive="text-slate-900" class="text-slate-500 hover:text-slate-900">
        Facturas
      </a>
```

- [ ] **Step 8: Ejecutar todos los tests frontend y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — 26 archivos / ~152 tests (23+3 nuevos: `facturas.service.spec.ts` 4, `marcar-cobrada-modal.spec.ts` 5, `facturas.spec.ts` 6 ≈ 140+15), sin regresiones.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/features/facturas/facturas.ts \
  frontend/src/app/features/facturas/facturas.html \
  frontend/src/app/features/facturas/facturas.css \
  frontend/src/app/features/facturas/facturas.spec.ts \
  frontend/src/app/app.routes.ts \
  frontend/src/app/shared/layout/layout.html
git commit -m "feat(facturas): add Facturas list screen, /facturas route and nav link"
```

---

### Task 4: Frontend — Presupuestos: modelo (facturaId) y PresupuestosService.convertirAFactura

**Files:**
- Modify: `frontend/src/app/core/models/presupuesto.models.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.service.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts`

**Interfaces:**
- Consumes: `HttpClient`, `firstValueFrom`, `extractErrorMessage` (sin cambios).
- Produces (usado por el Task 5):
  - `PresupuestoSummary.facturaId: string | null` (nuevo campo).
  - `ConvertirAFacturaRequest` — `{ serieId: string; porcentajeRetencionIrpf: number | null }`.
  - `PresupuestosService.convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<{ numeroCompleto: string }>`.

- [ ] **Step 1: Añadir el campo y el tipo de request al modelo**

En `frontend/src/app/core/models/presupuesto.models.ts`, cambiar:

```typescript
export interface PresupuestoSummary {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  numeroLineas: number;
}
```

por:

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

Y añadir, al final del archivo:

```typescript

export interface ConvertirAFacturaRequest {
  serieId: string;
  porcentajeRetencionIrpf: number | null;
}
```

- [ ] **Step 2: Actualizar los fixtures existentes de presupuestos.service.spec.ts (fallan primero por el tipo)**

En `frontend/src/app/features/presupuestos/presupuestos.service.spec.ts`, cambiar el fixture `summary1`:

```typescript
const summary1: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
};
```

por:

```typescript
const summary1: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: null,
};
```

Y añadir, dentro del `describe('PresupuestosService', ...)`, después del último test existente (`getById() gets the presupuesto by id without touching the list signals`):

```typescript

  it('convertirAFactura() posts the request, reloads the list, and resolves with the created factura data', async () => {
    const convertirPromise = service.convertirAFactura('p1', { serieId: 's1', porcentajeRetencionIrpf: 15 });

    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    expect(postReq.request.body).toEqual({ serieId: 's1', porcentajeRetencionIrpf: 15 });
    postReq.flush({ numeroCompleto: 'FAC-2026-00001' });

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await convertirPromise;
    expect(result).toEqual({ numeroCompleto: 'FAC-2026-00001' });
  });

  it('convertirAFactura() rejects and does not reload the list on conflict', async () => {
    const convertirPromise = service.convertirAFactura('p1', { serieId: 's1', porcentajeRetencionIrpf: null });
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    postReq.flush(
      { message: 'Este presupuesto ya fue convertido en factura.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(convertirPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });
```

Y añadir el import de `ConvertirAFacturaRequest` a la lista de imports existente desde `'../../core/models/presupuesto.models'`.

Run (desde `frontend/`): `npm test`
Expected: FAIL — `PresupuestosService.convertirAFactura` no existe todavía (error de compilación TypeScript).

- [ ] **Step 3: Implementar convertirAFactura en PresupuestosService**

En `frontend/src/app/features/presupuestos/presupuestos.service.ts`, añadir el import de `ConvertirAFacturaRequest` a la lista existente desde `'../../core/models/presupuesto.models'`, y añadir el método al final de la clase, después de `getById`:

```typescript
  async convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<{ numeroCompleto: string }> {
    const factura = await firstValueFrom(
      this.http.post<{ numeroCompleto: string }>(`/api/presupuestos/${id}/convertir-a-factura`, request),
    );
    await this.load();
    return factura;
  }
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — todos los tests de `PresupuestosService` en verde (incluidos los 2 nuevos), sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/models/presupuesto.models.ts \
  frontend/src/app/features/presupuestos/presupuestos.service.ts \
  frontend/src/app/features/presupuestos/presupuestos.service.spec.ts
git commit -m "feat(presupuestos): add facturaId to PresupuestoSummary and PresupuestosService.convertirAFactura"
```

---

### Task 5: Frontend — Presupuestos: ConvertirAFacturaModal y botón en el listado

**Files:**
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.html`
- Create: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.css`
- Test: `frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.ts`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.html`
- Modify: `frontend/src/app/features/presupuestos/presupuestos.spec.ts`

**Interfaces:**
- Consumes: `PresupuestosService.convertirAFactura`, `PresupuestoSummary.facturaId`, `ConvertirAFacturaRequest` (Task 4); `SeriesService` (ya existente, sin cambios).
- Produces: nada consumido por tasks posteriores — última tarea del plan.

- [ ] **Step 1: Escribir los tests de ConvertirAFacturaModal (fallan primero)**

Crear `frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2026,
  esRectificativa: false,
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('ConvertirAFacturaModal', () => {
  let component: ConvertirAFacturaModal;
  let presupuestosServiceStub: { convertirAFactura: ReturnType<typeof vi.fn> };
  let seriesServiceStub: { series: ReturnType<typeof signal<Serie[]>>; load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    presupuestosServiceStub = {
      convertirAFactura: vi.fn().mockResolvedValue({ numeroCompleto: 'FAC-2026-00001' }),
    };
    seriesServiceStub = {
      series: signal<Serie[]>([serie1]),
      load: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: SeriesService, useValue: seriesServiceStub },
      ],
    });

    component = TestBed.createComponent(ConvertirAFacturaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() resets the form, loads series, and shows the dialog', () => {
    component.serieId.set('leftover');
    component.porcentajeRetencionIrpf.set(21);

    component.open('p1', 'PRE-2026-001');

    expect(component.serieId()).toBe('');
    expect(component.porcentajeRetencionIrpf()).toBeNull();
    expect(seriesServiceStub.load).toHaveBeenCalled();
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when no serie is selected', async () => {
    component.open('p1', 'PRE-2026-001');

    await component.onSubmit();

    expect(component.formError()).toBe('Debés seleccionar una serie.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when IRPF is outside 0-100', async () => {
    component.open('p1', 'PRE-2026-001');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(150);

    await component.onSubmit();

    expect(component.formError()).toBe('El % de retención IRPF debe estar entre 0 y 100.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('onSubmit() converts, closes the dialog, and emits converted with the numeroCompleto', async () => {
    const convertedSpy = vi.fn();
    component.converted.subscribe(convertedSpy);
    component.open('p1', 'PRE-2026-001');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(15);

    await component.onSubmit();

    expect(presupuestosServiceStub.convertirAFactura).toHaveBeenCalledWith('p1', {
      serieId: 's1',
      porcentajeRetencionIrpf: 15,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(convertedSpy).toHaveBeenCalledWith('FAC-2026-00001');
  });

  it('onSubmit() sends null porcentajeRetencionIrpf when left blank', async () => {
    component.open('p1', 'PRE-2026-001');
    component.serieId.set('s1');

    await component.onSubmit();

    expect(presupuestosServiceStub.convertirAFactura).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ porcentajeRetencionIrpf: null }),
    );
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    presupuestosServiceStub.convertirAFactura.mockRejectedValue({
      error: { message: 'Este presupuesto ya fue convertido en factura.' },
    });
    component.open('p1', 'PRE-2026-001');
    component.serieId.set('s1');

    await component.onSubmit();

    expect(component.formError()).toBe('Este presupuesto ya fue convertido en factura.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
```

Run (desde `frontend/`): `npm test`
Expected: FAIL — `convertir-a-factura-modal.ts` no existe todavía.

- [ ] **Step 2: Implementar ConvertirAFacturaModal**

Crear `frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts`:

```typescript
import { Component, ElementRef, ViewChild, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
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
  readonly converted = output<string>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly serieId = signal('');
  readonly porcentajeRetencionIrpf = signal<number | null>(null);

  private presupuestoId = '';
  protected numero = '';

  open(presupuestoId: string, numero: string): void {
    this.presupuestoId = presupuestoId;
    this.numero = numero;
    this.serieId.set('');
    this.porcentajeRetencionIrpf.set(null);
    this.formError.set(null);
    void this.seriesService.load();
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    if (!this.serieId()) {
      this.formError.set('Debés seleccionar una serie.');
      return;
    }

    const irpf = this.porcentajeRetencionIrpf();
    if (irpf !== null && (!Number.isFinite(irpf) || irpf < 0 || irpf > 100)) {
      this.formError.set('El % de retención IRPF debe estar entre 0 y 100.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const factura = await this.presupuestosService.convertirAFactura(this.presupuestoId, {
        serieId: this.serieId(),
        porcentajeRetencionIrpf: irpf,
      });
      this.dialogEl.nativeElement.close();
      this.converted.emit(factura.numeroCompleto);
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }
}
```

Crear `frontend/src/app/features/presupuestos/convertir-a-factura-modal.html`:

```html
<dialog #dialogEl class="rounded-lg p-0 backdrop:bg-black/40">
  <form (ngSubmit)="onSubmit()" class="flex w-96 max-w-full flex-col gap-3 p-6">
    <h2 class="text-lg font-semibold">Convertir presupuesto {{ numero }} en factura</h2>

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
        @for (serie of seriesService.series(); track serie.id) {
          <option [ngValue]="serie.id">{{ serie.codigo }}-{{ serie.anio }}</option>
        }
      </select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      % Retención IRPF (opcional)
      <input
        [ngModel]="porcentajeRetencionIrpf()"
        (ngModelChange)="porcentajeRetencionIrpf.set($event)"
        name="porcentajeRetencionIrpf"
        type="number"
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
        {{ isSaving() ? 'Convirtiendo…' : 'Convertir a factura' }}
      </button>
    </div>
  </form>
</dialog>
```

Crear `frontend/src/app/features/presupuestos/convertir-a-factura-modal.css`:

```css
/* Convertir a factura modal styles */
```

- [ ] **Step 3: Ejecutar los tests del modal y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — todos los tests de `ConvertirAFacturaModal` en verde, sin regresiones.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/presupuestos/convertir-a-factura-modal.ts \
  frontend/src/app/features/presupuestos/convertir-a-factura-modal.html \
  frontend/src/app/features/presupuestos/convertir-a-factura-modal.css \
  frontend/src/app/features/presupuestos/convertir-a-factura-modal.spec.ts
git commit -m "feat(presupuestos): add ConvertirAFacturaModal component"
```

- [ ] **Step 5: Actualizar presupuestos.spec.ts (fallan primero)**

Reemplazar el contenido completo de `frontend/src/app/features/presupuestos/presupuestos.spec.ts` por:

```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Presupuestos } from './presupuestos';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
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
  facturaId: null,
};

const summaryEnviado: PresupuestoSummary = {
  id: 'p2',
  clienteId: 'c1',
  numero: 'PRE-2026-002',
  estado: EstadoPresupuesto.Enviado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 2,
  facturaId: null,
};

const summaryAceptado: PresupuestoSummary = {
  id: 'p3',
  clienteId: 'desconocido',
  numero: 'PRE-2026-003',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: null,
};

const summaryAceptadoConFactura: PresupuestoSummary = {
  id: 'p4',
  clienteId: 'c1',
  numero: 'PRE-2026-004',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: 'f1',
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
  let convertirModalStub: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const stubs = makeStubs();
    presupuestosServiceStub = stubs.presupuestosServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    modalStub = { openForCreate: vi.fn(), openForEdit: vi.fn() };
    convertirModalStub = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
      ],
    });

    component = TestBed.createComponent(Presupuestos).componentInstance;
    component.modal = modalStub as unknown as PresupuestoFormModal;
    component.convertirModal = convertirModalStub as unknown as ConvertirAFacturaModal;
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

  it('onConvertirAFactura() abre el modal de conversión con el id y número', () => {
    component.onConvertirAFactura(summaryAceptado);
    expect(convertirModalStub.open).toHaveBeenCalledWith('p3', 'PRE-2026-003');
  });

  it('onConverted() setea el mensaje de éxito con el número de factura', () => {
    component.onConverted('FAC-2026-00001');
    expect(component.facturaCreadaMensaje()).toBe('Factura FAC-2026-00001 creada correctamente.');
  });

  describe('template rendering', () => {
    function render(presupuestos: PresupuestoSummary[] = [summaryBorrador, summaryEnviado, summaryAceptado]) {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      stubs.presupuestosServiceStub.presupuestos.set(presupuestos);
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

    it('shows Convertir a factura only for Aceptado rows without factura', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const aceptadoRow = rows[2] as HTMLElement;
      expect(aceptadoRow.textContent).toContain('Convertir a factura');
      expect(aceptadoRow.textContent).not.toContain('Editar');
      expect(aceptadoRow.textContent).not.toContain('Enviar');
      expect(aceptadoRow.textContent).not.toContain('Aceptar');
      expect(aceptadoRow.textContent).not.toContain('Rechazar');
    });

    it('does not show Convertir a factura once the presupuesto already has a factura', () => {
      const fixture = render([summaryAceptadoConFactura]);
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect((rows[0] as HTMLElement).textContent).not.toContain('Convertir a factura');
    });

    it('shows the empty-state message when there are no presupuestos', () => {
      const fixture = render([]);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay presupuestos — creá el primero con "Nuevo presupuesto".');
    });
  });
});
```

Run (desde `frontend/`): `npm test`
Expected: FAIL — `Presupuestos.convertirModal`, `onConvertirAFactura`, `onConverted`, `facturaCreadaMensaje` no existen todavía; el botón "Convertir a factura" tampoco se renderiza.

- [ ] **Step 6: Actualizar el componente y la plantilla de Presupuestos**

Reemplazar el contenido completo de `frontend/src/app/features/presupuestos/presupuestos.ts` por:

```typescript
import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
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
  protected readonly EstadoPresupuesto = EstadoPresupuesto;
  protected readonly ESTADO_PRESUPUESTO_LABELS = ESTADO_PRESUPUESTO_LABELS;

  @ViewChild(PresupuestoFormModal) modal!: PresupuestoFormModal;
  @ViewChild(ConvertirAFacturaModal) convertirModal!: ConvertirAFacturaModal;

  readonly facturaCreadaMensaje = signal<string | null>(null);

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

  onConvertirAFactura(p: PresupuestoSummary): void {
    this.facturaCreadaMensaje.set(null);
    this.convertirModal.open(p.id, p.numero);
  }

  onConverted(numeroCompleto: string): void {
    this.facturaCreadaMensaje.set(`Factura ${numeroCompleto} creada correctamente.`);
  }

  onSaved(): void {
    // No-op: PresupuestosService.create()/update() already reload the list
    // themselves, and the modal closes itself on success. Bound to (saved)
    // only so the modal's documented output has a consumer.
  }
}
```

Reemplazar el contenido completo de `frontend/src/app/features/presupuestos/presupuestos.html` por:

```html
<div class="mx-auto max-w-5xl p-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold">Presupuestos</h1>
    <button type="button" (click)="onNew()" class="rounded bg-slate-900 px-4 py-2 text-sm text-white">
      Nuevo presupuesto
    </button>
  </div>

  @if (facturaCreadaMensaje()) {
    <p class="mb-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ facturaCreadaMensaje() }}</p>
  }

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
              } @else if (p.estado === EstadoPresupuesto.Aceptado && p.facturaId === null) {
                <button type="button" (click)="onConvertirAFactura(p)" class="text-slate-600 hover:underline">
                  Convertir a factura
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
  <app-convertir-a-factura-modal (converted)="onConverted($event)" />
</div>
```

- [ ] **Step 7: Ejecutar todos los tests frontend y confirmar que pasan**

Run (desde `frontend/`): `npm test`
Expected: PASS — todos los tests en verde (26 archivos, ~161 tests: los ~155 del Task 3 + 8 nuevos de `convertir-a-factura-modal.spec.ts` + 2 nuevos en `presupuestos.spec.ts`), sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/presupuestos/presupuestos.ts \
  frontend/src/app/features/presupuestos/presupuestos.html \
  frontend/src/app/features/presupuestos/presupuestos.spec.ts
git commit -m "feat(presupuestos): wire up Convertir a factura button and success banner"
```

---

## Verificación manual final (fuera de los tasks, tras la revisión final de rama)

1. Levantar backend (`cd backend/LocaleBoost.Api && dotnet run --urls http://localhost:5091`) y frontend (`cd frontend && npm start`).
2. Crear un cliente, una serie y un presupuesto con al menos una línea; pasarlo por Enviado → Aceptado.
3. Pulsar "Convertir a factura", elegir la serie, confirmar → verificar que aparece el banner de éxito, que la fila ya no muestra el botón, y que la factura aparece en `/facturas`.
4. En `/facturas`, pulsar "Marcar cobrada" en la factura recién creada, confirmar con una fecha → verificar que el estado pasa a "Cobrada" y el botón desaparece.
5. Recargar la página y confirmar que ambos cambios persisten (no son solo estado en memoria).
