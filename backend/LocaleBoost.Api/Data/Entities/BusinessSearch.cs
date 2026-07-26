namespace LocaleBoost.Api.Data.Entities;

public class BusinessSearch
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Query { get; set; } = string.Empty;
    public string? Location { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<BusinessSearchResult> Results { get; set; } = new();
}
