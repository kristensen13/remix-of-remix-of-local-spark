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
