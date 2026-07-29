using System.IO;
using System.Net;
using System.Text.Json;
using LocaleBoost.Api.Middleware;
using LocaleBoost.Api.Services;
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

    [Fact]
    public async Task InvokeAsync_WhenNextThrowsExternalServiceException_Returns502WithFriendlyMessage()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new ExternalServiceException(
                "No se pudo completar la búsqueda, intentá de nuevo.", new HttpRequestException("boom")),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeEnvironment());

        await middleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.BadGateway, context.Response.StatusCode);
        Assert.Equal("application/problem+json", context.Response.ContentType);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body);
        var body = await reader.ReadToEndAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("No se pudo completar la búsqueda, intentá de nuevo.", doc.RootElement.GetProperty("title").GetString());
        Assert.Equal(502, doc.RootElement.GetProperty("status").GetInt32());
    }
}
