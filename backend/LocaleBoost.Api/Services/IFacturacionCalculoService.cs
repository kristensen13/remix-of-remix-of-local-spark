using LocaleBoost.Api.Data.Entities;

namespace LocaleBoost.Api.Services;

public record TotalesFactura(decimal BaseImponible, decimal TotalIva, decimal TotalRetencion, decimal Total);

public interface IFacturacionCalculoService
{
    decimal ObtenerPorcentajeIva(TipoIva tipo);

    TotalesFactura CalcularTotales(
        IEnumerable<(decimal Cantidad, decimal PrecioUnitario, TipoIva TipoIva)> lineas,
        decimal? porcentajeRetencionIrpf);
}
