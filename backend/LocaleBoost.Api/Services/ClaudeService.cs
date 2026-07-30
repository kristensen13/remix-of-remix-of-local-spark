using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;

namespace LocaleBoost.Api.Services;

public class ClaudeService : IClaudeService
{
    private readonly AnthropicClient _client;

    public ClaudeService(IConfiguration configuration)
    {
        _client = new AnthropicClient
        {
            ApiKey = configuration["Claude:ApiKey"]
        };
    }

    // Testing seam: lets callers (unit tests) inject an AnthropicClient wired to a
    // fake HttpMessageHandler instead of hitting the real Anthropic API.
    internal ClaudeService(AnthropicClient client)
    {
        _client = client;
    }

    public async Task<string> GenerateWebsiteHtmlAsync(
        string businessName, string address, string? phone, CancellationToken cancellationToken = default)
    {
        var prompt =
            $"Generá un único archivo HTML autocontenido para una landing page simple de este negocio local, " +
            $"en castellano: Nombre: {businessName}. Dirección: {address}. Teléfono: {phone ?? "no disponible"}. " +
            "Respondé únicamente con el HTML, sin explicaciones.";

        try
        {
            var response = await _client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeOpus4_8,
                MaxTokens = 8192,
                Messages = [new() { Role = Role.User, Content = prompt }],
            }, cancellationToken);

            return response.Content
                .Select(b => b.Value)
                .OfType<TextBlock>()
                .FirstOrDefault()?.Text ?? string.Empty;
        }
        catch (AnthropicException ex)
        {
            throw new ExternalServiceException("No se pudo generar el sitio web, intentá de nuevo.", ex);
        }
    }

    public async Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
        string businessName, string address, string? phone, string existingSiteHtml,
        CancellationToken cancellationToken = default)
    {
        var prompt =
            "Sos un consultor de marketing digital. Te paso el HTML actual del sitio web de un negocio local " +
            "y sus datos. Necesito dos cosas, en castellano:\n\n" +
            "1. Una auditoría breve (4-8 puntos) de lo que se podría mejorar: SEO (títulos, meta descripción, " +
            "encabezados, contenido), diseño/usabilidad, adaptación a celular, y velocidad/estructura del " +
            "código si es evidente del HTML.\n" +
            "2. Una propuesta de sitio HTML mejorado, autocontenido en un solo archivo, que corrija esos puntos.\n\n" +
            $"Negocio: {businessName}. Dirección: {address}. Teléfono: {phone ?? "no disponible"}.\n\n" +
            $"HTML actual del sitio:\n{existingSiteHtml}\n\n" +
            "Respondé ÚNICAMENTE con un JSON válido de esta forma, sin texto antes ni después:\n" +
            "{\"audit\": \"<auditoría en texto plano, con saltos de línea entre puntos>\", " +
            "\"html\": \"<HTML completo de la propuesta>\"}";

        string rawText;
        try
        {
            var response = await _client.Messages.Create(new MessageCreateParams
            {
                Model = Model.ClaudeOpus4_8,
                MaxTokens = 16000,
                Messages = [new() { Role = Role.User, Content = prompt }],
            }, cancellationToken);

            if (response.StopReason?.Value() == StopReason.MaxTokens)
            {
                Console.Error.WriteLine(
                    "ClaudeService.AuditAndProposeWebsiteAsync: Claude audit response was truncated " +
                    "(stop_reason=max_tokens). Consider raising MaxTokens or shortening the prompt/HTML input.");
                throw new ExternalServiceException(
                    "No se pudo generar la auditoría, intentá de nuevo.",
                    new InvalidOperationException("Claude response truncated: stop_reason=max_tokens"));
            }

            rawText = response.Content
                .Select(b => b.Value)
                .OfType<TextBlock>()
                .FirstOrDefault()?.Text ?? string.Empty;
        }
        catch (AnthropicException ex)
        {
            Console.Error.WriteLine(
                $"ClaudeService.AuditAndProposeWebsiteAsync: Anthropic API call failed: {ex.Message}");
            throw new ExternalServiceException("No se pudo generar la auditoría, intentá de nuevo.", ex);
        }

        try
        {
            return ParseAuditResponse(rawText);
        }
        catch (JsonException ex)
        {
            Console.Error.WriteLine(
                "ClaudeService.AuditAndProposeWebsiteAsync: Failed to parse audit JSON response " +
                $"(possible truncation not flagged by stop_reason, or malformed output): {ex.Message}");
            throw new ExternalServiceException("No se pudo generar la auditoría, intentá de nuevo.", ex);
        }
    }

    private static WebsiteAuditResult ParseAuditResponse(string rawResponse)
    {
        var trimmed = rawResponse.Trim();
        if (trimmed.StartsWith("```"))
        {
            var firstNewline = trimmed.IndexOf('\n');
            var lastFence = trimmed.LastIndexOf("```");
            if (firstNewline >= 0 && lastFence > firstNewline)
            {
                trimmed = trimmed[(firstNewline + 1)..lastFence].Trim();
            }
        }

        var parsed = JsonSerializer.Deserialize<AuditJsonPayload>(trimmed)
            ?? throw new JsonException("Empty audit response");

        return new WebsiteAuditResult(parsed.Audit, parsed.Html);
    }

    private class AuditJsonPayload
    {
        [JsonPropertyName("audit")]
        public string Audit { get; set; } = string.Empty;

        [JsonPropertyName("html")]
        public string Html { get; set; } = string.Empty;
    }
}
