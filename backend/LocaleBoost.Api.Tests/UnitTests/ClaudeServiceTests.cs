using System.Net;
using System.Text;
using Anthropic;
using Anthropic.Exceptions;
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

    private class ErrorStatusHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var json = "{\"type\": \"error\", \"error\": {\"type\": \"api_error\", \"message\": \"upstream failure\"}}";
            var response = new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task GenerateWebsiteHtmlAsync_WhenAnthropicApiFails_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler())
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.GenerateWebsiteHtmlAsync("Test Cafe", "Main St 1", "111"));

        Assert.Equal("No se pudo generar el sitio web, intentá de nuevo.", ex.Message);
        Assert.IsAssignableFrom<AnthropicException>(ex.InnerException);
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

    [Fact]
    public async Task AuditAndProposeWebsiteAsync_ReturnsParsedAuditAndHtml()
    {
        var claudeResponseJson = "{\"content\": [{\"type\": \"text\", \"text\": \"{\\\"audit\\\": \\\"Le falta meta descripci\\u00f3n.\\\", \\\"html\\\": \\\"<html>Mejorado</html>\\\"}\"}]}";

        var httpClient = new HttpClient(new FakeHandler(claudeResponseJson))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var result = await service.AuditAndProposeWebsiteAsync(
            "Test Cafe", "Main St 1", "111", "<html><body>Old site</body></html>");

        Assert.Equal("Le falta meta descripción.", result.AuditSummary);
        Assert.Equal("<html>Mejorado</html>", result.ProposedHtml);
    }

    [Fact]
    public async Task AuditAndProposeWebsiteAsync_WhenResponseIsNotValidJson_ThrowsExternalServiceException()
    {
        var claudeResponseJson = "{\"content\": [{\"type\": \"text\", \"text\": \"not json at all\"}]}";

        var httpClient = new HttpClient(new FakeHandler(claudeResponseJson))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.AuditAndProposeWebsiteAsync("Test Cafe", "Main St 1", "111", "<html></html>"));

        Assert.Equal("No se pudo generar la auditoría, intentá de nuevo.", ex.Message);
    }

    [Fact]
    public async Task AuditAndProposeWebsiteAsync_WhenAnthropicApiFails_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler())
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var anthropicClient = new AnthropicClient
        {
            ApiKey = "test-key",
            HttpClient = httpClient
        };

        var service = new ClaudeService(anthropicClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.AuditAndProposeWebsiteAsync("Test Cafe", "Main St 1", "111", "<html></html>"));

        Assert.Equal("No se pudo generar la auditoría, intentá de nuevo.", ex.Message);
        Assert.IsAssignableFrom<AnthropicException>(ex.InnerException);
    }
}
