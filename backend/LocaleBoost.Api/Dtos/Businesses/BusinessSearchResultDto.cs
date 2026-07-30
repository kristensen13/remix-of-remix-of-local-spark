namespace LocaleBoost.Api.Dtos.Businesses;

public record BusinessSearchResultDto(
    Guid Id, string PlaceId, string Name, string Address, string? Phone, bool HasWebsite, string? WebsiteUrl);

public record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results);

public record BusinessSearchSummaryDto(Guid Id, string Query, string? Location, DateTime CreatedAt, int ResultCount);

public record BusinessSearchDetailDto(
    Guid Id, string Query, string? Location, DateTime CreatedAt, List<BusinessSearchResultDto> Results);
