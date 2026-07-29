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

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new ExternalServiceException("No se pudo completar la búsqueda, intentá de nuevo.", ex);
        }

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
