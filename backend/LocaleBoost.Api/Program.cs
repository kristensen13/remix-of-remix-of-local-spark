using System.Text;
using LocaleBoost.Api.Auth;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Middleware;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentityCore<IdentityUser<Guid>>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = true;
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

builder.Services.AddHttpClient<IGoogleMapsService, GoogleMapsService>(client =>
{
    client.BaseAddress = new Uri("https://places.googleapis.com/");
});

builder.Services.AddScoped<IClaudeService, ClaudeService>();

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();

const string DevOnlyJwtKeyPlaceholder = "dev-only-placeholder-key-change-me-in-every-real-environment";
if (app.Environment.IsProduction())
{
    var jwtKey = builder.Configuration["Jwt:Key"];

    if (jwtKey == DevOnlyJwtKeyPlaceholder)
    {
        throw new InvalidOperationException(
            "Jwt:Key must be overridden via environment variable in Production — refusing to start with the development placeholder.");
    }

    if (Encoding.UTF8.GetByteCount(jwtKey ?? string.Empty) < 32)
    {
        throw new InvalidOperationException(
            "Jwt:Key must be at least 256 bits (32 UTF-8 bytes) for HS256 in Production — refusing to start with a weak key.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapControllers();

app.Run();

public partial class Program { }
