namespace LocaleBoost.Api.Services;

public record GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, string? WebsiteUrl);

public interface IGoogleMapsService
{
    Task<List<GoogleMapsPlace>> SearchBusinessesAsync(
        string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default);
}
