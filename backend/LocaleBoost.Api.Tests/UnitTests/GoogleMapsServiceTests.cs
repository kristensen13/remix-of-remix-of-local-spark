using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class GoogleMapsServiceTests
{
    private class FakeHandler : HttpMessageHandler
    {
        private readonly string _json;
        public FakeHandler(string json) => _json = json;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json")
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
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("upstream failure", Encoding.UTF8, "text/plain")
            });
        }
    }

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
}
