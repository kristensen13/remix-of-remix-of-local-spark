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
}
