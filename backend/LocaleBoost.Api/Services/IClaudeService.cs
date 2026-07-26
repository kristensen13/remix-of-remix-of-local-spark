namespace LocaleBoost.Api.Services;

public interface IClaudeService
{
    Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default);
}
