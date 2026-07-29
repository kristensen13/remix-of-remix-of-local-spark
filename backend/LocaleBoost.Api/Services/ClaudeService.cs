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
}
