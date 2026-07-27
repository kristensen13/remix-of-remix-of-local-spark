namespace LocaleBoost.Api.Data.Entities;

public class GeneratedWebsite
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessAddress { get; set; } = string.Empty;
    public string? BusinessPhone { get; set; }
    public string GeneratedContent { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
