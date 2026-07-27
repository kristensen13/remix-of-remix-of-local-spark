namespace LocaleBoost.Api.Dtos.Websites;

public record GenerateWebsiteRequest(Guid BusinessSearchResultId);

public record GeneratedWebsiteDto(
    Guid Id, string BusinessName, string BusinessAddress, string? BusinessPhone,
    string GeneratedContent, DateTime CreatedAt);
