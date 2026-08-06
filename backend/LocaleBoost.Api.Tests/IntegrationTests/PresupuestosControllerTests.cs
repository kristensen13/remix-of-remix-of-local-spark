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

public class PresupuestosControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PresupuestosControllerTests(CustomWebApplicationFactory factory)
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

    [Fact]
    public async Task Update_WithChangedLineas_ReturnsOkAndPersistsNewLineas()
    {
        var client = await CreateAuthenticatedClientAsync();
        var clienteId = await CreateClienteAsync(client);

        var createRequest = new CreatePresupuestoRequest(
            clienteId,
            "PRES-0001",
            DateTime.UtcNow.AddDays(30),
            "Notas iniciales",
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Línea original", 1m, 100m, TipoIva.General21, 0)
            });

        var createResponse = await client.PostAsJsonAsync("/api/presupuestos", createRequest);
        createResponse.EnsureSuccessStatusCode();
        var created = await createResponse.Content.ReadFromJsonAsync<PresupuestoDto>();
        Assert.NotNull(created);

        // Cambiamos el número y el contenido de las líneas para forzar que EF trate
        // las nuevas líneas como Added en vez de Modified (bug de fixup del change tracker).
        var updateRequest = new UpdatePresupuestoRequest(
            DateTime.UtcNow.AddDays(60),
            "Notas actualizadas",
            new List<LineaPresupuestoRequest>
            {
                new(TipoLinea.ServicioPorHoras, "Línea modificada A", 3m, 150m, TipoIva.General21, 0),
                new(TipoLinea.Producto, "Línea modificada B", 2m, 50m, TipoIva.Reducido10, 1)
            });

        var updateResponse = await client.PutAsJsonAsync($"/api/presupuestos/{created!.Id}", updateRequest);

        var body = await updateResponse.Content.ReadAsStringAsync();
        Assert.True(
            updateResponse.StatusCode == HttpStatusCode.OK,
            $"Expected 200 OK but got {(int)updateResponse.StatusCode} {updateResponse.StatusCode}. Body: {body}");

        var updated = await updateResponse.Content.ReadFromJsonAsync<PresupuestoDto>();
        Assert.NotNull(updated);
        Assert.Equal(2, updated!.Lineas.Count);

        var lineaA = updated.Lineas.Single(l => l.Orden == 0);
        Assert.Equal("Línea modificada A", lineaA.Descripcion);
        Assert.Equal(3m, lineaA.Cantidad);
        Assert.Equal(150m, lineaA.PrecioUnitario);

        var lineaB = updated.Lineas.Single(l => l.Orden == 1);
        Assert.Equal("Línea modificada B", lineaB.Descripcion);
        Assert.Equal(TipoIva.Reducido10, lineaB.TipoIva);

        // Confirmamos también contra la base de datos real, no solo la respuesta serializada.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await db.Presupuestos
            .Include(p => p.Lineas)
            .SingleAsync(p => p.Id == created.Id);

        Assert.Equal(2, persisted.Lineas.Count);
        Assert.Contains(persisted.Lineas, l => l.Descripcion == "Línea modificada A");
        Assert.Contains(persisted.Lineas, l => l.Descripcion == "Línea modificada B");
    }

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
}
