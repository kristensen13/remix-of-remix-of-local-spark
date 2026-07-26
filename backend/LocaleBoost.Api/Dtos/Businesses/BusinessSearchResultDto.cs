namespace LocaleBoost.Api.Dtos.Businesses;

public record BusinessSearchResultDto(Guid Id, string PlaceId, string Name, string Address, string? Phone);

public record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results);
