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

public class BusinessSearchHistoryTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

    public BusinessSearchHistoryTests(CustomWebApplicationFactory factory)
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
    public async Task GetSearches_OnlyReturnsOwnSearches()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        await clientA.GetAsync("/api/businesses/search?query=cafes");

        var responseA = await clientA.GetAsync("/api/businesses/searches");
        var responseB = await clientB.GetAsync("/api/businesses/searches");

        var searchesA = await responseA.Content.ReadFromJsonAsync<List<BusinessSearchSummaryDto>>();
        var searchesB = await responseB.Content.ReadFromJsonAsync<List<BusinessSearchSummaryDto>>();

        Assert.Single(searchesA!);
        Assert.Empty(searchesB!);
    }

    [Fact]
    public async Task GetSearchById_ForAnotherUsersSearch_ReturnsNotFound()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await clientB.GetAsync($"/api/businesses/searches/{search!.SearchId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetSearchById_ForOwnSearch_ReturnsFullDetail()
    {
        var client = await CreateAuthenticatedClientAsync();

        var searchResponse = await client.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await client.GetAsync($"/api/businesses/searches/{search!.SearchId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.Content.ReadFromJsonAsync<BusinessSearchDetailDto>();
        Assert.Single(detail!.Results);
    }
}
