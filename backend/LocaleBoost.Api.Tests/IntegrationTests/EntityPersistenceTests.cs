using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class EntityPersistenceTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public EntityPersistenceTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task CanPersist_BusinessSearch_WithResults_AndGeneratedWebsite()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var userId = Guid.NewGuid();

        // The BusinessSearch/GeneratedWebsite UserId columns now carry a real FK
        // to AspNetUsers, so a matching user row must exist before we can
        // reference it.
        db.Users.Add(new IdentityUser<Guid>
        {
            Id = userId,
            UserName = $"test-{userId}@example.com",
            NormalizedUserName = $"TEST-{userId}@EXAMPLE.COM",
            Email = $"test-{userId}@example.com",
            NormalizedEmail = $"TEST-{userId}@EXAMPLE.COM"
        });

        var search = new BusinessSearch
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Query = "cafes",
            Location = "Madrid",
            CreatedAt = DateTime.UtcNow,
            Results = new List<BusinessSearchResult>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PlaceId = "place-1",
                    Name = "Test Cafe",
                    Address = "Main St 1",
                    Phone = "555-0001",
                    HasWebsite = true,
                    WebsiteUrl = "https://test-cafe.example.com"
                }
            }
        };
        db.BusinessSearches.Add(search);

        db.InviteCodes.Add(new InviteCode
        {
            Id = Guid.NewGuid(),
            Code = "TEST-CODE",
            IsUsed = false,
            CreatedAt = DateTime.UtcNow
        });

        db.GeneratedWebsites.Add(new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            BusinessName = "Test Cafe",
            BusinessAddress = "Main St 1",
            BusinessPhone = "555-0001",
            GeneratedContent = "<html></html>",
            AuditSummary = "Le falta meta descripción y no es responsive.",
            SourceWebsiteUrl = "https://test-cafe.example.com",
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();

        var reloaded = await db.BusinessSearches
            .Include(s => s.Results)
            .SingleAsync(s => s.Id == search.Id);

        Assert.Single(reloaded.Results);
        Assert.Equal("Test Cafe", reloaded.Results[0].Name);
        Assert.Equal("https://test-cafe.example.com", reloaded.Results[0].WebsiteUrl);

        var reloadedWebsite = await db.GeneratedWebsites.SingleAsync(w => w.UserId == userId);
        Assert.Equal("Le falta meta descripción y no es responsive.", reloadedWebsite.AuditSummary);
        Assert.Equal("https://test-cafe.example.com", reloadedWebsite.SourceWebsiteUrl);
    }
}
