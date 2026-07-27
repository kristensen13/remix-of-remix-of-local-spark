namespace LocaleBoost.Api.Services;

public record GoogleMapsPlace(string PlaceId, string Name, string Address, string? Phone, bool HasWebsite);

public interface IGoogleMapsService
{
    Task<List<GoogleMapsPlace>> SearchBusinessesWithoutWebsiteAsync(
        string query, string? location, CancellationToken cancellationToken = default);
}
