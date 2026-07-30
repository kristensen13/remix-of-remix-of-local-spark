namespace LocaleBoost.Api.Services;

public interface IWebsiteFetcherService
{
    Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default);
}
