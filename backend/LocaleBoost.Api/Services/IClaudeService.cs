namespace LocaleBoost.Api.Services;

public record WebsiteAuditResult(string AuditSummary, string ProposedHtml);

public interface IClaudeService
{
    Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default);

    Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
        string businessName, string address, string? phone, string existingSiteHtml,
        CancellationToken cancellationToken = default);
}
