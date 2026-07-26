using System.Net;
using System.Text;
using Anthropic;
using LocaleBoost.Api.Services;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class ClaudeServiceTests
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
    public async Task GenerateWebsiteHtmlAsync_ReturnsTextFromAnthropicResponse()
    {
        var json = "{\"content\": [{\"type\": \"text\", \"text\": \"<html>Generated</html>\"}]}";

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var result = await service.GenerateWebsiteHtmlAsync("Test Cafe", "Main St 1", "111");

        Assert.Equal("<html>Generated</html>", result);
    }
}
