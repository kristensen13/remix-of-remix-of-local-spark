namespace LocaleBoost.Api.Data.Entities;

public class InviteCode
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public bool IsUsed { get; set; }
    public Guid? UsedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UsedAt { get; set; }
}
