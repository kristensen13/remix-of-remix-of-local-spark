using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

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

public class BusinessesControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

    public BusinessesControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IGoogleMapsService));
                if (descriptor is not null)
                {
                    services.Remove(descriptor);
                }
                services.AddScoped<IGoogleMapsService, FakeGoogleMapsService>();
            });
        });
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

    [Fact]
    public async Task Search_WithoutAuth_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/businesses/search?query=cafes");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Search_WithAuth_PersistsAndReturnsResults()
    {
        var client = await CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/businesses/search?query=cafes&location=Madrid");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        Assert.Single(body!.Results);
        Assert.Equal("Test Business", body.Results[0].Name);
    }
}
