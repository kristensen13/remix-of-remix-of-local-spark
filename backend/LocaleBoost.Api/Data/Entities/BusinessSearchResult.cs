namespace LocaleBoost.Api.Data.Entities;

public class BusinessSearchResult
{
    public Guid Id { get; set; }
    public Guid BusinessSearchId { get; set; }
    public string PlaceId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public bool HasWebsite { get; set; }
    public string? WebsiteUrl { get; set; }
}
