using System.Net;
using System.Text;
using LocaleBoost.Api.Services;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class WebsiteFetcherServiceTests
{
    private class FakeHandler : HttpMessageHandler
    {
        private readonly string _content;
        public FakeHandler(string content) => _content = content;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_content, Encoding.UTF8, "text/html")
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
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("not found", Encoding.UTF8, "text/plain")
            });
        }
    }

    [Fact]
    public async Task FetchHtmlAsync_ReturnsContent_WhenUnderTheSizeLimit()
    {
        var httpClient = new HttpClient(new FakeHandler("<html><body>Hello</body></html>"));
        var service = new WebsiteFetcherService(httpClient);

        var result = await service.FetchHtmlAsync("https://example.com");

        Assert.Equal("<html><body>Hello</body></html>", result);
    }

    [Fact]
    public async Task FetchHtmlAsync_TruncatesContent_WhenOverTheSizeLimit()
    {
        var longContent = new string('a', 60_000);
        var httpClient = new HttpClient(new FakeHandler(longContent));
        var service = new WebsiteFetcherService(httpClient);

        var result = await service.FetchHtmlAsync("https://example.com");

        Assert.Equal(50_000, result.Length);
    }

    [Fact]
    public async Task FetchHtmlAsync_WhenHttpRequestExceptionThrown_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ThrowingHandler());
        var service = new WebsiteFetcherService(httpClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.FetchHtmlAsync("https://example.com"));

        Assert.Equal("No se pudo acceder al sitio web actual, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }

    [Fact]
    public async Task FetchHtmlAsync_WhenUpstreamReturnsErrorStatus_WrapsAsExternalServiceException()
    {
        var httpClient = new HttpClient(new ErrorStatusHandler());
        var service = new WebsiteFetcherService(httpClient);

        var ex = await Assert.ThrowsAsync<ExternalServiceException>(
            () => service.FetchHtmlAsync("https://example.com"));

        Assert.Equal("No se pudo acceder al sitio web actual, intentá de nuevo.", ex.Message);
        Assert.IsType<HttpRequestException>(ex.InnerException);
    }
}
