# Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ASP.NET Core Web API (.NET 8) covering auth, business search, AI website generation, and listings, as specified in `docs/superpowers/specs/2026-07-21-angular-dotnet-rebuild-design.md`, fully testable over HTTP without any frontend.

**Architecture:** Controller-based ASP.NET Core Web API, EF Core + Npgsql against PostgreSQL, ASP.NET Core Identity (email/password) issuing JWTs for auth, typed `HttpClient`s wrapping Google Maps Platform and Anthropic Claude, all behind a single global exception-handling middleware.

**Tech Stack:** .NET 8, ASP.NET Core Web API (controllers), EF Core 8 + Npgsql, ASP.NET Core Identity, JWT Bearer auth, xUnit + `Microsoft.AspNetCore.Mvc.Testing` + Testcontainers.PostgreSql for integration tests.

## Global Constraints

- Target framework: .NET 8 (`net8.0`).
- Database: PostgreSQL only, via EF Core + Npgsql — no other ORM/data-access library.
- Auth: ASP.NET Core Identity + JWT bearer tokens only — no cookie auth, no third-party auth provider.
- No repository/CQRS/MediatR layer — controllers talk to `AppDbContext` and services directly (three controllers doesn't justify more indirection).
- All external API calls (Google Maps, Claude) happen only in the backend; API keys live only in backend configuration/environment variables, never sent to a client.
- Registration requires a valid, unused `InviteCode` row — no open self-registration. Invite codes are inserted directly into the database via SQL; no admin endpoint exists.
- Search results are persisted **grouped by search** (`BusinessSearch` + `BusinessSearchResult`), not as a flat per-business list.
- Per-user rate limiting on search/generation endpoints is explicitly **deferred** — do not implement it in this plan.
- Every endpoint except `POST /api/auth/register` and `POST /api/auth/login` requires `[Authorize]`, and every query must be scoped by the authenticated user's id (`ClaimTypes.NameIdentifier`).

## Prerequisites (one-time, not a task)

Run once before Task 1, from the repo root:

```bash
dotnet tool install --global dotnet-ef
```

If it's already installed, this prints a message saying so — that's fine, continue.

---

### Task 1: Solution scaffold, Postgres wiring, health-check smoke test

**Files:**
- Create: `backend/LocaleBoost.sln`
- Create: `backend/LocaleBoost.Api/LocaleBoost.Api.csproj` (via `dotnet new`)
- Create: `backend/LocaleBoost.Api/Program.cs`
- Create: `backend/LocaleBoost.Api/appsettings.json`
- Create: `backend/LocaleBoost.Api/Data/AppDbContext.cs`
- Create: `backend/LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj` (via `dotnet new`)
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/CustomWebApplicationFactory.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/HealthCheckTests.cs`

**Interfaces:**
- Produces: `AppDbContext` (in `LocaleBoost.Api.Data`), extended by Task 2 with entity `DbSet`s and by Task 3 with Identity services.
- Produces: `CustomWebApplicationFactory` (in `LocaleBoost.Api.Tests.IntegrationTests`), reused by every later integration test task.
- Produces: `public partial class Program { }` marker at the bottom of `Program.cs`, required for `WebApplicationFactory<Program>` to work — every later task that edits `Program.cs` must keep this line.

- [ ] **Step 1: Scaffold the projects**

```bash
mkdir -p backend
dotnet new sln -n LocaleBoost -o backend
dotnet new webapi -controllers -n LocaleBoost.Api -o backend/LocaleBoost.Api
dotnet new xunit -n LocaleBoost.Api.Tests -o backend/LocaleBoost.Api.Tests
dotnet sln backend/LocaleBoost.sln add backend/LocaleBoost.Api/LocaleBoost.Api.csproj
dotnet sln backend/LocaleBoost.sln add backend/LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj
dotnet add backend/LocaleBoost.Api.Tests/LocaleBoost.Api.Tests.csproj reference backend/LocaleBoost.Api/LocaleBoost.Api.csproj
```

Delete the template's sample files that we don't need:

```bash
rm -f backend/LocaleBoost.Api/WeatherForecast.cs
rm -f backend/LocaleBoost.Api/Controllers/WeatherForecastController.cs
```

- [ ] **Step 2: Add NuGet packages**

```bash
dotnet add backend/LocaleBoost.Api package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add backend/LocaleBoost.Api package Microsoft.EntityFrameworkCore.Design
dotnet add backend/LocaleBoost.Api package Microsoft.AspNetCore.Identity.EntityFrameworkCore
dotnet add backend/LocaleBoost.Api package Microsoft.AspNetCore.Authentication.JwtBearer

dotnet add backend/LocaleBoost.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
dotnet add backend/LocaleBoost.Api.Tests package Testcontainers.PostgreSql
```

- [ ] **Step 3: Write `AppDbContext` (Identity tables only for now)**

```csharp
// backend/LocaleBoost.Api/Data/AppDbContext.cs
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Data;

public class AppDbContext : IdentityDbContext<IdentityUser<Guid>, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
    }
}
```

- [ ] **Step 4: Write `appsettings.json` with the connection string**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=localeboost;Username=postgres;Password=postgres"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

- [ ] **Step 5: Write `Program.cs` (base structure, no `/health` endpoint yet)**

```csharp
// backend/LocaleBoost.Api/Program.cs
using LocaleBoost.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();

app.MapControllers();

app.Run();

public partial class Program { }
```

- [ ] **Step 6: Write `CustomWebApplicationFactory`**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/CustomWebApplicationFactory.cs
using LocaleBoost.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
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
    }

    async Task IAsyncLifetime.InitializeAsync()
    {
        await _postgres.StartAsync();

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await _postgres.DisposeAsync();
    }
}
```

- [ ] **Step 7: Write the failing test for `/health`**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/HealthCheckTests.cs
using System.Net;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class HealthCheckTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public HealthCheckTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsOk()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

- [ ] **Step 8: Generate the initial migration (Identity tables)**

```bash
dotnet ef migrations add InitialIdentity --project backend/LocaleBoost.Api --startup-project backend/LocaleBoost.Api
```

Expected: a `Migrations/` folder appears under `backend/LocaleBoost.Api/` with a migration creating the `AspNetUsers`, `AspNetRoles`, etc. tables. Commit these generated files as-is.

- [ ] **Step 9: Run the test to verify it fails**

Requires Docker running locally (Testcontainers needs it).

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~HealthCheckTests"`
Expected: FAIL — `/health` returns 404 because the endpoint doesn't exist yet.

- [ ] **Step 10: Add the `/health` endpoint**

```csharp
// backend/LocaleBoost.Api/Program.cs
using LocaleBoost.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();

public partial class Program { }
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~HealthCheckTests"`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold API project with Postgres wiring and health check"
```

---

### Task 2: Domain entities and migration

**Files:**
- Create: `backend/LocaleBoost.Api/Data/Entities/InviteCode.cs`
- Create: `backend/LocaleBoost.Api/Data/Entities/BusinessSearch.cs`
- Create: `backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs`
- Create: `backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs`
- Modify: `backend/LocaleBoost.Api/Data/AppDbContext.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/EntityPersistenceTests.cs`

**Interfaces:**
- Consumes: `AppDbContext`, `CustomWebApplicationFactory` (Task 1).
- Produces: `InviteCode`, `BusinessSearch`, `BusinessSearchResult`, `GeneratedWebsite` entity classes (in `LocaleBoost.Api.Data.Entities`), used by every later task.

- [ ] **Step 1: Write the failing test**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/EntityPersistenceTests.cs
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
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
                    HasWebsite = false
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
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();

        var reloaded = await db.BusinessSearches
            .Include(s => s.Results)
            .SingleAsync(s => s.Id == search.Id);

        Assert.Single(reloaded.Results);
        Assert.Equal("Test Cafe", reloaded.Results[0].Name);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~EntityPersistenceTests"`
Expected: FAIL — build error, `BusinessSearch`/`InviteCode`/`GeneratedWebsite` don't exist yet.

- [ ] **Step 3: Write the entity classes**

```csharp
// backend/LocaleBoost.Api/Data/Entities/InviteCode.cs
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
```

```csharp
// backend/LocaleBoost.Api/Data/Entities/BusinessSearch.cs
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
```

```csharp
// backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs
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
}
```

```csharp
// backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs
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
```

- [ ] **Step 4: Wire the entities into `AppDbContext`**

```csharp
// backend/LocaleBoost.Api/Data/AppDbContext.cs
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
    }
}
```

- [ ] **Step 5: Generate the migration**

```bash
dotnet ef migrations add AddDomainEntities --project backend/LocaleBoost.Api --startup-project backend/LocaleBoost.Api
```

Expected: a new migration file creating `InviteCodes`, `BusinessSearches`, `BusinessSearchResults`, `GeneratedWebsites` tables.

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~EntityPersistenceTests"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): add domain entities and migration"
```

---

### Task 3: JWT auth — register and login

**Files:**
- Create: `backend/LocaleBoost.Api/Dtos/Auth/RegisterRequest.cs`
- Create: `backend/LocaleBoost.Api/Dtos/Auth/LoginRequest.cs`
- Create: `backend/LocaleBoost.Api/Dtos/Auth/AuthResponse.cs`
- Create: `backend/LocaleBoost.Api/Auth/JwtTokenService.cs`
- Create: `backend/LocaleBoost.Api/Controllers/AuthController.cs`
- Modify: `backend/LocaleBoost.Api/appsettings.json`
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/AuthControllerTests.cs`

**Interfaces:**
- Consumes: `AppDbContext`, `InviteCode` entity (Tasks 1-2).
- Produces: `RegisterRequest(string Email, string Password, string InviteCode)`, `LoginRequest(string Email, string Password)`, `AuthResponse(string Token)` — reused by every later integration test that needs an authenticated client. `JwtTokenService.CreateToken(IdentityUser<Guid> user) : string`.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/AuthControllerTests.cs
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~AuthControllerTests"`
Expected: FAIL — build error, `RegisterRequest`/`LoginRequest`/`AuthResponse`/`AuthController` don't exist yet.

- [ ] **Step 3: Write the DTOs**

```csharp
// backend/LocaleBoost.Api/Dtos/Auth/RegisterRequest.cs
namespace LocaleBoost.Api.Dtos.Auth;

public record RegisterRequest(string Email, string Password, string InviteCode);
```

```csharp
// backend/LocaleBoost.Api/Dtos/Auth/LoginRequest.cs
namespace LocaleBoost.Api.Dtos.Auth;

public record LoginRequest(string Email, string Password);
```

```csharp
// backend/LocaleBoost.Api/Dtos/Auth/AuthResponse.cs
namespace LocaleBoost.Api.Dtos.Auth;

public record AuthResponse(string Token);
```

- [ ] **Step 4: Write `JwtTokenService`**

```csharp
// backend/LocaleBoost.Api/Auth/JwtTokenService.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace LocaleBoost.Api.Auth;

public class JwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreateToken(IdentityUser<Guid> user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email ?? string.Empty)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

- [ ] **Step 5: Write `AuthController`**

```csharp
// backend/LocaleBoost.Api/Controllers/AuthController.cs
using LocaleBoost.Api.Auth;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Dtos.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<IdentityUser<Guid>> _userManager;
    private readonly AppDbContext _db;
    private readonly JwtTokenService _tokenService;

    public AuthController(UserManager<IdentityUser<Guid>> userManager, AppDbContext db, JwtTokenService tokenService)
    {
        _userManager = userManager;
        _db = db;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var inviteCode = await _db.InviteCodes
            .SingleOrDefaultAsync(c => c.Code == request.InviteCode && !c.IsUsed);

        if (inviteCode is null)
        {
            return BadRequest(new { message = "Invalid or already used invite code." });
        }

        var user = new IdentityUser<Guid> { Id = Guid.NewGuid(), UserName = request.Email, Email = request.Email };
        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join("; ", result.Errors.Select(e => e.Description)) });
        }

        inviteCode.IsUsed = true;
        inviteCode.UsedByUserId = user.Id;
        inviteCode.UsedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var token = _tokenService.CreateToken(user);
        return Ok(new AuthResponse(token));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        var token = _tokenService.CreateToken(user);
        return Ok(new AuthResponse(token));
    }
}
```

- [ ] **Step 6: Add JWT settings to `appsettings.json`**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=localeboost;Username=postgres;Password=postgres"
  },
  "Jwt": {
    "Key": "dev-only-placeholder-key-change-me-in-every-real-environment",
    "Issuer": "LocaleBoost.Api",
    "Audience": "LocaleBoost.Client"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

- [ ] **Step 7: Wire Identity, `JwtTokenService`, and JWT auth into `Program.cs`**

```csharp
// backend/LocaleBoost.Api/Program.cs
using System.Text;
using LocaleBoost.Api.Auth;
using LocaleBoost.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentityCore<IdentityUser<Guid>>(options =>
    {
        options.Password.RequiredLength = 6;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddScoped<JwtTokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();

public partial class Program { }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~AuthControllerTests"`
Expected: PASS (all 5 tests)

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): invite-code-gated registration and JWT login"
```

---

### Task 4: Global exception-handling middleware

**Files:**
- Create: `backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs`
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Test: `backend/LocaleBoost.Api.Tests/UnitTests/ExceptionHandlingMiddlewareTests.cs`

**Interfaces:**
- Produces: nothing consumed by name by later tasks — this wraps the whole pipeline. Later tasks just rely on unhandled exceptions turning into a 500 `application/problem+json` response instead of crashing the request.

- [ ] **Step 1: Write the failing test**

```csharp
// backend/LocaleBoost.Api.Tests/UnitTests/ExceptionHandlingMiddlewareTests.cs
using System.Net;
using LocaleBoost.Api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class ExceptionHandlingMiddlewareTests
{
    private class FakeEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    [Fact]
    public async Task InvokeAsync_WhenNextThrows_Returns500ProblemJson()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException("boom"),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeEnvironment());

        await middleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.InternalServerError, context.Response.StatusCode);
        Assert.Equal("application/problem+json", context.Response.ContentType);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~ExceptionHandlingMiddlewareTests"`
Expected: FAIL — build error, `ExceptionHandlingMiddleware` doesn't exist yet.

- [ ] **Step 3: Write the middleware**

```csharp
// backend/LocaleBoost.Api/Middleware/ExceptionHandlingMiddleware.cs
using System.Net;
using System.Text.Json;

namespace LocaleBoost.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");

            context.Response.ContentType = "application/problem+json";
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

            var problem = new
            {
                title = "An unexpected error occurred.",
                status = 500,
                detail = _environment.IsDevelopment() ? ex.ToString() : null
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(problem));
        }
    }
}
```

- [ ] **Step 4: Register the middleware first in the pipeline**

```csharp
// backend/LocaleBoost.Api/Program.cs
using System.Text;
using LocaleBoost.Api.Auth;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentityCore<IdentityUser<Guid>>(options =>
    {
        options.Password.RequiredLength = 6;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddScoped<JwtTokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();

public partial class Program { }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~ExceptionHandlingMiddlewareTests"`
Expected: PASS

- [ ] **Step 6: Run the full suite to check nothing else broke**

Run: `dotnet test backend/LocaleBoost.Api.Tests`
Expected: PASS (all tests so far)

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): global exception-handling middleware"
```

---

### Task 5: `GoogleMapsService`

**Files:**
- Create: `backend/LocaleBoost.Api/Services/IGoogleMapsService.cs`
- Create: `backend/LocaleBoost.Api/Services/GoogleMapsService.cs`
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Modify: `backend/LocaleBoost.Api/appsettings.json`
- Test: `backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs`

**Interfaces:**
- Produces: `IGoogleMapsService.SearchBusinessesWithoutWebsiteAsync(string query, string? location, CancellationToken ct = default) : Task<List<GoogleMapsPlace>>`, and `record GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, bool HasWebsite)` — both consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```csharp
// backend/LocaleBoost.Api.Tests/UnitTests/GoogleMapsServiceTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class GoogleMapsServiceTests
{
    private class FakeHandler : HttpMessageHandler
    {
        private readonly string _json;
        public FakeHandler(string json) => _json = json;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task SearchBusinessesWithoutWebsiteAsync_FiltersOutPlacesWithWebsite()
    {
        var json = JsonSerializer.Serialize(new
        {
            places = new object[]
            {
                new { id = "1", displayName = new { text = "No Website Cafe" }, formattedAddress = "Main St 1", nationalPhoneNumber = "111", websiteUri = (string?)null },
                new { id = "2", displayName = new { text = "Has Website Bakery" }, formattedAddress = "Main St 2", nationalPhoneNumber = "222", websiteUri = "https://bakery.example.com" }
            }
        });

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://places.googleapis.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoogleMaps:ApiKey"] = "test-key" })
            .Build();

        var service = new GoogleMapsService(httpClient, config);

        var results = await service.SearchBusinessesWithoutWebsiteAsync("cafes", "Madrid");

        Assert.Single(results);
        Assert.Equal("No Website Cafe", results[0].Name);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~GoogleMapsServiceTests"`
Expected: FAIL — build error, `GoogleMapsService` doesn't exist yet.

- [ ] **Step 3: Write `IGoogleMapsService`**

```csharp
// backend/LocaleBoost.Api/Services/IGoogleMapsService.cs
namespace LocaleBoost.Api.Services;

public record GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, bool HasWebsite);

public interface IGoogleMapsService
{
    Task<List<GoogleMapsPlace>> SearchBusinessesWithoutWebsiteAsync(
        string query, string? location, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 4: Write `GoogleMapsService`**

```csharp
// backend/LocaleBoost.Api/Services/GoogleMapsService.cs
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace LocaleBoost.Api.Services;

public class GoogleMapsService : IGoogleMapsService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public GoogleMapsService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<List<GoogleMapsPlace>> SearchBusinessesWithoutWebsiteAsync(
        string query, string? location, CancellationToken cancellationToken = default)
    {
        var textQuery = string.IsNullOrWhiteSpace(location) ? query : $"{query} {location}";

        var request = new HttpRequestMessage(HttpMethod.Post, "v1/places:searchText")
        {
            Content = JsonContent.Create(new { textQuery })
        };
        request.Headers.Add("X-Goog-Api-Key", _configuration["GoogleMaps:ApiKey"]);
        request.Headers.Add("X-Goog-FieldMask",
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri");

        var response = await _httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<PlacesSearchResponse>(
            cancellationToken: cancellationToken);

        return (payload?.Places ?? new List<PlaceResult>())
            .Where(p => string.IsNullOrWhiteSpace(p.WebsiteUri))
            .Select(p => new GoogleMapsPlace(
                p.Id,
                p.DisplayName?.Text ?? string.Empty,
                p.FormattedAddress ?? string.Empty,
                p.NationalPhoneNumber,
                HasWebsite: false))
            .ToList();
    }

    private class PlacesSearchResponse
    {
        [JsonPropertyName("places")]
        public List<PlaceResult>? Places { get; set; }
    }

    private class PlaceResult
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public DisplayName? DisplayName { get; set; }

        [JsonPropertyName("formattedAddress")]
        public string? FormattedAddress { get; set; }

        [JsonPropertyName("nationalPhoneNumber")]
        public string? NationalPhoneNumber { get; set; }

        [JsonPropertyName("websiteUri")]
        public string? WebsiteUri { get; set; }
    }

    private class DisplayName
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
```

- [ ] **Step 5: Register the typed client and config key in `Program.cs` / `appsettings.json`**

Add to `appsettings.json` (alongside the existing `Jwt` section):

```json
  "GoogleMaps": {
    "ApiKey": ""
  },
```

Add to `Program.cs`, after the `AddAuthorization();` line and before `var app = builder.Build();`:

```csharp
using LocaleBoost.Api.Services;
```

(add to the `using` block at the top), and:

```csharp
builder.Services.AddHttpClient<IGoogleMapsService, GoogleMapsService>(client =>
{
    client.BaseAddress = new Uri("https://places.googleapis.com/");
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~GoogleMapsServiceTests"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): GoogleMapsService for business search"
```

---

### Task 6: Business search endpoint (persisted)

**Files:**
- Create: `backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`
- Create: `backend/LocaleBoost.Api/Controllers/BusinessesController.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs`

**Interfaces:**
- Consumes: `IGoogleMapsService` (Task 5), `AppDbContext`, `BusinessSearch`/`BusinessSearchResult` entities (Task 2), `RegisterRequest`/`AuthResponse` (Task 3).
- Produces: `record BusinessSearchResultDto(Guid Id, string PlaceId, string Name, string Address, string? Phone)` and `record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results)`, reused by Task 7 and by the frontend plan. `BusinessesController.CurrentUserId` pattern (`Guid` from `ClaimTypes.NameIdentifier`), reused by Task 7.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessesControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class FakeGoogleMapsService : IGoogleMapsService
{
    public Task<List<GoogleMapsPlace>> SearchBusinessesWithoutWebsiteAsync(
        string query, string? location, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new List<GoogleMapsPlace>
        {
            new("place-1", "Test Business", "Test Address 1", "555-0001", false)
        });
    }
}

public class BusinessesControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public BusinessesControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IGoogleMapsService));
                if (descriptor is not null)
                {
                    services.Remove(descriptor);
                }
                services.AddScoped<IGoogleMapsService, FakeGoogleMapsService>();
            });
        });
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var code = Guid.NewGuid().ToString("N");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.InviteCodes.Add(new InviteCode
            {
                Id = Guid.NewGuid(),
                Code = code,
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    [Fact]
    public async Task Search_WithoutAuth_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/businesses/search?query=cafes");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Search_WithAuth_PersistsAndReturnsResults()
    {
        var client = await CreateAuthenticatedClientAsync();

        var response = await client.GetAsync("/api/businesses/search?query=cafes&location=Madrid");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        Assert.Single(body!.Results);
        Assert.Equal("Test Business", body.Results[0].Name);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~BusinessesControllerTests"`
Expected: FAIL — build error, `BusinessesController`/`BusinessSearchResultDto`/`BusinessSearchResponse` don't exist yet.

- [ ] **Step 3: Write the DTOs**

```csharp
// backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs
namespace LocaleBoost.Api.Dtos.Businesses;

public record BusinessSearchResultDto(Guid Id, string PlaceId, string Name, string Address, string? Phone);

public record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results);
```

- [ ] **Step 4: Write `BusinessesController`**

```csharp
// backend/LocaleBoost.Api/Controllers/BusinessesController.cs
using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/businesses")]
[Authorize]
public class BusinessesController : ControllerBase
{
    private readonly IGoogleMapsService _googleMaps;
    private readonly AppDbContext _db;

    public BusinessesController(IGoogleMapsService googleMaps, AppDbContext db)
    {
        _googleMaps = googleMaps;
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("search")]
    public async Task<ActionResult<BusinessSearchResponse>> Search(
        [FromQuery] string query, [FromQuery] string? location)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "Query is required." });
        }

        var places = await _googleMaps.SearchBusinessesWithoutWebsiteAsync(query, location);

        var search = new BusinessSearch
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Query = query,
            Location = location,
            CreatedAt = DateTime.UtcNow,
            Results = places.Select(p => new BusinessSearchResult
            {
                Id = Guid.NewGuid(),
                PlaceId = p.PlaceId,
                Name = p.Name,
                Address = p.Address,
                Phone = p.Phone,
                HasWebsite = p.HasWebsite
            }).ToList()
        };

        _db.BusinessSearches.Add(search);
        await _db.SaveChangesAsync();

        return Ok(new BusinessSearchResponse(
            search.Id,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone))
                .ToList()));
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~BusinessesControllerTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): business search endpoint with persistence"
```

---

### Task 7: Search history endpoints

**Files:**
- Modify: `backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`
- Modify: `backend/LocaleBoost.Api/Controllers/BusinessesController.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessSearchHistoryTests.cs`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: `record BusinessSearchSummaryDto(Guid Id, string Query, string? Location, DateTime CreatedAt, int ResultCount)`, `record BusinessSearchDetailDto(Guid Id, string Query, string? Location, DateTime CreatedAt, List<BusinessSearchResultDto> Results)` — reused by the frontend plan.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/BusinessSearchHistoryTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class BusinessSearchHistoryTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public BusinessSearchHistoryTests(CustomWebApplicationFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IGoogleMapsService));
                if (descriptor is not null)
                {
                    services.Remove(descriptor);
                }
                services.AddScoped<IGoogleMapsService, FakeGoogleMapsService>();
            });
        });
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var code = Guid.NewGuid().ToString("N");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.InviteCodes.Add(new InviteCode
            {
                Id = Guid.NewGuid(),
                Code = code,
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    [Fact]
    public async Task GetSearches_OnlyReturnsOwnSearches()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        await clientA.GetAsync("/api/businesses/search?query=cafes");

        var responseA = await clientA.GetAsync("/api/businesses/searches");
        var responseB = await clientB.GetAsync("/api/businesses/searches");

        var searchesA = await responseA.Content.ReadFromJsonAsync<List<BusinessSearchSummaryDto>>();
        var searchesB = await responseB.Content.ReadFromJsonAsync<List<BusinessSearchSummaryDto>>();

        Assert.Single(searchesA!);
        Assert.Empty(searchesB!);
    }

    [Fact]
    public async Task GetSearchById_ForAnotherUsersSearch_ReturnsNotFound()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await clientB.GetAsync($"/api/businesses/searches/{search!.SearchId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetSearchById_ForOwnSearch_ReturnsFullDetail()
    {
        var client = await CreateAuthenticatedClientAsync();

        var searchResponse = await client.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await client.GetAsync($"/api/businesses/searches/{search!.SearchId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.Content.ReadFromJsonAsync<BusinessSearchDetailDto>();
        Assert.Single(detail!.Results);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~BusinessSearchHistoryTests"`
Expected: FAIL — build error, `BusinessSearchSummaryDto`/`BusinessSearchDetailDto` don't exist and the endpoints 404.

- [ ] **Step 3: Add the summary/detail DTOs**

```csharp
// backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs
namespace LocaleBoost.Api.Dtos.Businesses;

public record BusinessSearchResultDto(Guid Id, string PlaceId, string Name, string Address, string? Phone);

public record BusinessSearchResponse(Guid SearchId, List<BusinessSearchResultDto> Results);

public record BusinessSearchSummaryDto(Guid Id, string Query, string? Location, DateTime CreatedAt, int ResultCount);

public record BusinessSearchDetailDto(
    Guid Id, string Query, string? Location, DateTime CreatedAt, List<BusinessSearchResultDto> Results);
```

- [ ] **Step 4: Add the two endpoints to `BusinessesController`**

Add these two actions inside the existing `BusinessesController` class (after the `Search` method), and add `using Microsoft.EntityFrameworkCore;` to the top of the file:

```csharp
    [HttpGet("searches")]
    public async Task<ActionResult<List<BusinessSearchSummaryDto>>> GetSearches()
    {
        var searches = await _db.BusinessSearches
            .Where(s => s.UserId == CurrentUserId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new BusinessSearchSummaryDto(s.Id, s.Query, s.Location, s.CreatedAt, s.Results.Count))
            .ToListAsync();

        return Ok(searches);
    }

    [HttpGet("searches/{id:guid}")]
    public async Task<ActionResult<BusinessSearchDetailDto>> GetSearchById(Guid id)
    {
        var search = await _db.BusinessSearches
            .Include(s => s.Results)
            .SingleOrDefaultAsync(s => s.Id == id && s.UserId == CurrentUserId);

        if (search is null)
        {
            return NotFound();
        }

        return Ok(new BusinessSearchDetailDto(
            search.Id,
            search.Query,
            search.Location,
            search.CreatedAt,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone))
                .ToList()));
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~BusinessSearchHistoryTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): search history endpoints, scoped per user"
```

---

### Task 8: `ClaudeService`

**Files:**
- Create: `backend/LocaleBoost.Api/Services/IClaudeService.cs`
- Create: `backend/LocaleBoost.Api/Services/ClaudeService.cs`
- Modify: `backend/LocaleBoost.Api/Program.cs`
- Modify: `backend/LocaleBoost.Api/appsettings.json`
- Test: `backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs`

**Interfaces:**
- Produces: `IClaudeService.GenerateWebsiteHtmlAsync(string businessName, string address, string? phone, CancellationToken ct = default) : Task<string>`, consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```csharp
// backend/LocaleBoost.Api.Tests/UnitTests/ClaudeServiceTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LocaleBoost.Api.Tests.UnitTests;

public class ClaudeServiceTests
{
    private class FakeHandler : HttpMessageHandler
    {
        private readonly string _json;
        public FakeHandler(string json) => _json = json;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task GenerateWebsiteHtmlAsync_ReturnsTextFromFirstContentBlock()
    {
        var json = JsonSerializer.Serialize(new
        {
            content = new object[] { new { type = "text", text = "<html>Generated</html>" } }
        });

        var httpClient = new HttpClient(new FakeHandler(json))
        {
            BaseAddress = new Uri("https://api.anthropic.com/")
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Claude:ApiKey"] = "test-key" })
            .Build();

        var service = new ClaudeService(httpClient, config);

        var html = await service.GenerateWebsiteHtmlAsync("Test Cafe", "Main St 1", "555-0001");

        Assert.Equal("<html>Generated</html>", html);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~ClaudeServiceTests"`
Expected: FAIL — build error, `ClaudeService` doesn't exist yet.

- [ ] **Step 3: Write `IClaudeService`**

```csharp
// backend/LocaleBoost.Api/Services/IClaudeService.cs
namespace LocaleBoost.Api.Services;

public interface IClaudeService
{
    Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 4: Write `ClaudeService`**

```csharp
// backend/LocaleBoost.Api/Services/ClaudeService.cs
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace LocaleBoost.Api.Services;

public class ClaudeService : IClaudeService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public ClaudeService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default)
    {
        var prompt =
            $"Generate a single self-contained HTML file for a simple landing page for this local business: " +
            $"Name: {businessName}. Address: {address}. Phone: {phone ?? "not provided"}. " +
            "Return only the HTML, no explanation.";

        var request = new HttpRequestMessage(HttpMethod.Post, "v1/messages")
        {
            Content = JsonContent.Create(new
            {
                model = "claude-sonnet-5",
                max_tokens = 4096,
                messages = new[] { new { role = "user", content = prompt } }
            })
        };
        request.Headers.Add("x-api-key", _configuration["Claude:ApiKey"]);
        request.Headers.Add("anthropic-version", "2023-06-01");

        var response = await _httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<ClaudeResponse>(
            cancellationToken: cancellationToken);

        return payload?.Content?.FirstOrDefault()?.Text ?? string.Empty;
    }

    private class ClaudeResponse
    {
        [JsonPropertyName("content")]
        public List<ClaudeContentBlock>? Content { get; set; }
    }

    private class ClaudeContentBlock
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
```

- [ ] **Step 5: Register the typed client and config key**

Add to `appsettings.json` (alongside `GoogleMaps`):

```json
  "Claude": {
    "ApiKey": ""
  },
```

Add to `Program.cs`, after the `GoogleMaps` `AddHttpClient` call:

```csharp
builder.Services.AddHttpClient<IClaudeService, ClaudeService>(client =>
{
    client.BaseAddress = new Uri("https://api.anthropic.com/");
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~ClaudeServiceTests"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): ClaudeService for landing page generation"
```

---

### Task 9: Website generation endpoint

**Files:**
- Create: `backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs`
- Create: `backend/LocaleBoost.Api/Controllers/WebsitesController.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs`

**Interfaces:**
- Consumes: `IClaudeService` (Task 8), `BusinessSearchResult`/`GeneratedWebsite` entities (Task 2), auth helpers from Task 6/3.
- Produces: `record GenerateWebsiteRequest(Guid BusinessSearchResultId)`, `record GeneratedWebsiteDto(Guid Id, string BusinessName, string BusinessAddress, string? BusinessPhone, string GeneratedContent, DateTime CreatedAt)` — reused by Task 10 and the frontend plan.

- [ ] **Step 1: Write the failing tests**

```csharp
// backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Auth;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Dtos.Websites;
using LocaleBoost.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LocaleBoost.Api.Tests.IntegrationTests;

public class FakeClaudeService : IClaudeService
{
    public Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default)
    {
        return Task.FromResult($"<html>{businessName}</html>");
    }
}

public class WebsitesControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public WebsitesControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var mapsDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IGoogleMapsService));
                if (mapsDescriptor is not null) services.Remove(mapsDescriptor);
                services.AddScoped<IGoogleMapsService, FakeGoogleMapsService>();

                var claudeDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IClaudeService));
                if (claudeDescriptor is not null) services.Remove(claudeDescriptor);
                services.AddScoped<IClaudeService, FakeClaudeService>();
            });
        });
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var code = Guid.NewGuid().ToString("N");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.InviteCodes.Add(new InviteCode
            {
                Id = Guid.NewGuid(),
                Code = code,
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@test.com", "Password1", code));
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    [Fact]
    public async Task Generate_ForOwnSearchResult_CreatesAndReturnsWebsite()
    {
        var client = await CreateAuthenticatedClientAsync();
        var searchResponse = await client.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await client.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GeneratedWebsiteDto>();
        Assert.Equal("<html>Test Business</html>", body!.GeneratedContent);
    }

    [Fact]
    public async Task Generate_ForAnotherUsersSearchResult_ReturnsNotFound()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();

        var response = await clientB.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~WebsitesControllerTests"`
Expected: FAIL — build error, `WebsitesController`/`GenerateWebsiteRequest`/`GeneratedWebsiteDto` don't exist yet.

- [ ] **Step 3: Write the DTOs**

```csharp
// backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs
namespace LocaleBoost.Api.Dtos.Websites;

public record GenerateWebsiteRequest(Guid BusinessSearchResultId);

public record GeneratedWebsiteDto(
    Guid Id, string BusinessName, string BusinessAddress, string? BusinessPhone,
    string GeneratedContent, DateTime CreatedAt);
```

- [ ] **Step 4: Write `WebsitesController`**

```csharp
// backend/LocaleBoost.Api/Controllers/WebsitesController.cs
using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Websites;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/websites")]
[Authorize]
public class WebsitesController : ControllerBase
{
    private readonly IClaudeService _claude;
    private readonly AppDbContext _db;

    public WebsitesController(IClaudeService claude, AppDbContext db)
    {
        _claude = claude;
        _db = db;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpPost("generate")]
    public async Task<ActionResult<GeneratedWebsiteDto>> Generate(GenerateWebsiteRequest request)
    {
        var result = await _db.BusinessSearchResults
            .Join(_db.BusinessSearches,
                r => r.BusinessSearchId,
                s => s.Id,
                (r, s) => new { Result = r, Search = s })
            .Where(x => x.Result.Id == request.BusinessSearchResultId && x.Search.UserId == CurrentUserId)
            .Select(x => x.Result)
            .SingleOrDefaultAsync();

        if (result is null)
        {
            return NotFound();
        }

        var html = await _claude.GenerateWebsiteHtmlAsync(result.Name, result.Address, result.Phone);

        var website = new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            BusinessName = result.Name,
            BusinessAddress = result.Address,
            BusinessPhone = result.Phone,
            GeneratedContent = html,
            CreatedAt = DateTime.UtcNow
        };

        _db.GeneratedWebsites.Add(website);
        await _db.SaveChangesAsync();

        return Ok(new GeneratedWebsiteDto(
            website.Id, website.BusinessName, website.BusinessAddress,
            website.BusinessPhone, website.GeneratedContent, website.CreatedAt));
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~WebsitesControllerTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): website generation endpoint"
```

---

### Task 10: Website listing endpoint

**Files:**
- Modify: `backend/LocaleBoost.Api/Controllers/WebsitesController.cs`
- Test: `backend/LocaleBoost.Api.Tests/IntegrationTests/WebsitesControllerTests.cs`

**Interfaces:**
- Consumes: everything from Task 9.
- Produces: `GET /api/websites` returning `List<GeneratedWebsiteDto>`, consumed by the frontend plan's `GeneratedWebsitesService`.

- [ ] **Step 1: Add the failing test**

Add this test method inside the existing `WebsitesControllerTests` class from Task 9:

```csharp
    [Fact]
    public async Task GetAll_OnlyReturnsOwnGeneratedWebsites()
    {
        var clientA = await CreateAuthenticatedClientAsync();
        var clientB = await CreateAuthenticatedClientAsync();

        var searchResponse = await clientA.GetAsync("/api/businesses/search?query=cafes");
        var search = await searchResponse.Content.ReadFromJsonAsync<BusinessSearchResponse>();
        await clientA.PostAsJsonAsync("/api/websites/generate",
            new GenerateWebsiteRequest(search!.Results[0].Id));

        var responseA = await clientA.GetAsync("/api/websites");
        var responseB = await clientB.GetAsync("/api/websites");

        var websitesA = await responseA.Content.ReadFromJsonAsync<List<GeneratedWebsiteDto>>();
        var websitesB = await responseB.Content.ReadFromJsonAsync<List<GeneratedWebsiteDto>>();

        Assert.Single(websitesA!);
        Assert.Empty(websitesB!);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~GetAll_OnlyReturnsOwnGeneratedWebsites"`
Expected: FAIL — 404, `GET /api/websites` doesn't exist yet.

- [ ] **Step 3: Add the listing endpoint**

Add this action inside `WebsitesController` (after `Generate`):

```csharp
    [HttpGet]
    public async Task<ActionResult<List<GeneratedWebsiteDto>>> GetAll()
    {
        var websites = await _db.GeneratedWebsites
            .Where(w => w.UserId == CurrentUserId)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new GeneratedWebsiteDto(
                w.Id, w.BusinessName, w.BusinessAddress, w.BusinessPhone, w.GeneratedContent, w.CreatedAt))
            .ToListAsync();

        return Ok(websites);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/LocaleBoost.Api.Tests --filter "FullyQualifiedName~GetAll_OnlyReturnsOwnGeneratedWebsites"`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `dotnet test backend/LocaleBoost.Api.Tests`
Expected: PASS (every test across every task in this plan)

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): website listing endpoint, scoped per user"
```

---

## Out of scope for this plan (tracked in the spec)

- Serving the Angular frontend from this API (`MapFallbackToFile`, static files) — covered in the Deployment/Integration plan.
- Railway configuration, Dockerfile, and real (non-placeholder) API keys — covered in the Deployment/Integration plan.
- Per-user rate limiting — deferred per the spec.
- Seeding the first invite code into the real database — a one-line SQL `INSERT`, done manually when the project is deployed, not part of this codebase.
