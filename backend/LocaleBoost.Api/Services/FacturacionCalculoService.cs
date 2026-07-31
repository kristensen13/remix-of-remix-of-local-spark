using LocaleBoost.Api.Data.Entities;

namespace LocaleBoost.Api.Services;

public class FacturacionCalculoService : IFacturacionCalculoService
{
    public decimal ObtenerPorcentajeIva(TipoIva tipo) => tipo switch
    {
        TipoIva.General21 => 0.21m,
        TipoIva.Reducido10 => 0.10m,
        TipoIva.Superreducido4 => 0.04m,
        TipoIva.Exento => 0m,
        _ => throw new ArgumentOutOfRangeException(nameof(tipo), tipo, "Tipo de IVA no reconocido.")
    };

    public TotalesFactura CalcularTotales(
        IEnumerable<(decimal Cantidad, decimal PrecioUnitario, TipoIva TipoIva)> lineas,
        decimal? porcentajeRetencionIrpf)
    {
        decimal baseImponible = 0m;
        decimal totalIva = 0m;

        foreach (var linea in lineas)
        {
            var importeLinea = linea.Cantidad * linea.PrecioUnitario;
            baseImponible += importeLinea;
            totalIva += importeLinea * ObtenerPorcentajeIva(linea.TipoIva);
        }

        var totalRetencion = porcentajeRetencionIrpf.HasValue
            ? baseImponible * (porcentajeRetencionIrpf.Value / 100m)
            : 0m;

        var total = baseImponible + totalIva - totalRetencion;

        return new TotalesFactura(
            Math.Round(baseImponible, 2),
            Math.Round(totalIva, 2),
            Math.Round(totalRetencion, 2),
            Math.Round(total, 2));
    }
}
