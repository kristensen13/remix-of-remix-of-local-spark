using System.Linq;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Dtos.Websites;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

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

public class FakeWebsiteFetcherService : IWebsiteFetcherService
{
    public Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default)
    {
        return Task.FromResult("<html><body>Old site</body></html>");
    }
}

public class WebsitesControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

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
    public async Task Generate_ForOwnSearchResult_CreatesAndReturnsWebsite()
    {
        var client = await CreateAuthenticatedClientAsync();
        var searchResponse = await client.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await client.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GeneratedWebsiteDto>();
        Assert.Equal("<html>Test Business</html>", body!.GeneratedContent);
    }

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

    [Fact]
    public async Task Generate_ForAnotherUsersSearchResult_ReturnsNotFound()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await clientB.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetAll_OnlyReturnsOwnGeneratedWebsites()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        await clientA.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        var responseA = await clientA.GetAsync("/api/websites");
        var responseB = await clientB.GetAsync("/api/websites");

        var websitesA = await responseA.Content.ReadFromJsonAsync<List<GeneratedWebsiteDto>>();
        var websitesB = await responseB.Content.ReadFromJsonAsync<List<GeneratedWebsiteDto>>();

        Assert.Single(websitesA!);
        Assert.Empty(websitesB!);
    }
}
