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

    [Fact]
    public async Task SearchBusinessesWithoutWebsiteAsync_FiltersOutPlacesWithWebsite()
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

        var results = await service.SearchBusinessesWithoutWebsiteAsync("cafes", "Madrid");

        Assert.Single(results);
        Assert.Equal("No Website Cafe", results[0].Name);
    }
}
