using System.Net;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class AuthControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public AuthControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<string> SeedInviteCodeAsync()
    {
        var code = Guid.NewGuid().ToString("N");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.InviteCodes.Add(new InviteCode
        {
            Id = Guid.NewGuid(),
            Code = code,
            IsUsed = false,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        return code;
    }

    [Fact]
    public async Task Register_WithValidInviteCode_ReturnsToken()
    {
        var code = await SeedInviteCodeAsync();
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.False(string.IsNullOrWhiteSpace(body!.Token));
    }

    [Fact]
    public async Task Register_WithInvalidInviteCode_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", "not-a-real-code"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithAlreadyUsedInviteCode_ReturnsBadRequest()
    {
        var code = await SeedInviteCodeAsync();
        var client = _factory.CreateClient();

        await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithConcurrentRequestsForSameInviteCode_OnlyOneSucceeds()
    {
        var code = await SeedInviteCodeAsync();
        var client1 = _factory.CreateClient();
        var client2 = _factory.CreateClient();

        var request1 = client1.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));
        var request2 = client2.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));

        var responses = await Task.WhenAll(request1, request2);

        var statusCodes = responses.Select(r => r.StatusCode).ToList();
        Assert.Equal(1, statusCodes.Count(s => s == HttpStatusCode.OK));
        Assert.Equal(1, statusCodes.Count(s => s == HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Login_WithCorrectCredentials_ReturnsToken()
    {
        var code = await SeedInviteCodeAsync();
        var client = _factory.CreateClient();
        var email = $"{Guid.NewGuid()}@test.com";
        await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Password1", code));

        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "Password1"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        var code = await SeedInviteCodeAsync();
        var client = _factory.CreateClient();
        var email = $"{Guid.NewGuid()}@test.com";
        await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Password1", code));

        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "WrongPassword"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
