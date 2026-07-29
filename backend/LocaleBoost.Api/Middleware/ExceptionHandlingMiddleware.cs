using System.Net;
using System.Text.Json;
using LocaleBoost.Api.Services;

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
        catch (ExternalServiceException ex)
        {
            _logger.LogError(ex, "External service call failed");

            context.Response.ContentType = "application/problem+json";
            context.Response.StatusCode = (int)HttpStatusCode.BadGateway;

            var problem = new
            {
                title = ex.Message,
                status = (int)HttpStatusCode.BadGateway,
                detail = _environment.IsDevelopment() ? ex.ToString() : null
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(problem));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");

            context.Response.ContentType = "application/problem+json";
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

            var problem = new
            {
                title = "Ocurrió un error inesperado.",
                status = 500,
                detail = _environment.IsDevelopment() ? ex.ToString() : null
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(problem));
        }
    }
}
