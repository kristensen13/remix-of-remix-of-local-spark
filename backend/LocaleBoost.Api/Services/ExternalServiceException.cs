namespace LocaleBoost.Api.Services;

/// <summary>
/// Raised when an outbound call to a third-party service (Google Maps, Claude, etc.)
/// fails in a way that should be surfaced to the client as a controlled error rather
/// than an opaque 500. The <see cref="Exception.Message"/> is safe to return to callers.
/// </summary>
public class ExternalServiceException : Exception
{
    public ExternalServiceException(string message, Exception innerException) : base(message, innerException) { }
}
