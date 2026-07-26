using LocaleBoost.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Data;

public class AppDbContext : IdentityDbContext<IdentityUser<Guid>, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<InviteCode> InviteCodes => Set<InviteCode>();
    public DbSet<BusinessSearch> BusinessSearches => Set<BusinessSearch>();
    public DbSet<BusinessSearchResult> BusinessSearchResults => Set<BusinessSearchResult>();
    public DbSet<GeneratedWebsite> GeneratedWebsites => Set<GeneratedWebsite>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<InviteCode>()
            .HasIndex(i => i.Code)
            .IsUnique();

        builder.Entity<BusinessSearch>()
            .HasMany(s => s.Results)
            .WithOne()
            .HasForeignKey(r => r.BusinessSearchId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<InviteCode>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(i => i.UsedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Entity<BusinessSearch>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<GeneratedWebsite>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(w => w.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
