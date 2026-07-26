namespace LocaleBoost.Api.Dtos.Auth;

public record RegisterRequest(string Email, string Password, string InviteCode);
