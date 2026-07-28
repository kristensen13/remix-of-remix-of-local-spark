using System.Net;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class StartupMigrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
    private WebApplicationFactory<Program> _factory = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
                if (descriptor is not null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<AppDbContext>(options =>
                    options.UseNpgsql(_postgres.GetConnectionString()));
            });
        });
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    [Fact]
    public async Task FreshUnmigratedDatabase_SchemaExistsAfterAppStartup_WithoutManualMigrateCall()
    {
        // No MigrateAsync() call anywhere in this test — if Program.cs doesn't migrate
        // on startup, this register call will fail because AspNetUsers/InviteCodes don't exist.
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "startup-migration-check@example.com",
            password = "Password1",
            inviteCode = "does-not-exist"
        });

        // 400 (invalid invite code) proves the schema exists and the query ran cleanly —
        // a missing-table error would surface as a 500, not a 400.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
