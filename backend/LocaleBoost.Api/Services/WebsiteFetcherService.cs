namespace LocaleBoost.Api.Services;

public class WebsiteFetcherService : IWebsiteFetcherService
{
    private const int MaxContentLength = 50_000;
    private readonly HttpClient _httpClient;

    public WebsiteFetcherService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default)
    {
        string content;
        try
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            content = await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ExternalServiceException("No se pudo acceder al sitio web actual, intentá de nuevo.", ex);
        }

        return content.Length > MaxContentLength ? content[..MaxContentLength] : content;
    }
}
