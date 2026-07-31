using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Presupuestos;

namespace LocaleBoost.Api.Dtos.Facturas;

public record LineaFacturaDto(
    Guid Id, TipoLinea Tipo, string Descripcion, decimal Cantidad, decimal PrecioUnitario, TipoIva TipoIva, int Orden);

public record FacturaDto(
    Guid Id,
    Guid ClienteId,
    Guid SerieId,
    string NumeroCompleto,
    EstadoFactura Estado,
    DateTime FechaEmision,
    DateTime? FechaVencimiento,
    decimal? PorcentajeRetencionIrpf,
    decimal BaseImponible,
    decimal TotalIva,
    decimal TotalRetencion,
    decimal Total,
    Guid? PresupuestoOrigenId,
    Guid? FacturaRectificadaId,
    string? PdfUrl,
    List<LineaFacturaDto> Lineas,
    DateTime CreatedAt);

public record FacturaSummaryDto(
    Guid Id, Guid ClienteId, string NumeroCompleto, EstadoFactura Estado, DateTime FechaEmision, decimal Total);

public record MarcarCobradaRequest(DateTime FechaCobro);

public record RectificarFacturaRequest(
    Guid SerieRectificativaId,
    string Motivo,
    List<LineaPresupuestoRequest> LineasCorregidas);

public static class FacturaMappingExtensions
{
    public static FacturaDto ToDto(this Factura f) => new(
        f.Id, f.ClienteId, f.SerieId, f.NumeroCompleto, f.Estado, f.FechaEmision, f.FechaVencimiento,
        f.PorcentajeRetencionIrpf, f.BaseImponible, f.TotalIva, f.TotalRetencion, f.Total,
        f.PresupuestoOrigenId, f.FacturaRectificadaId, f.PdfUrl,
        f.Lineas.OrderBy(l => l.Orden)
            .Select(l => new LineaFacturaDto(l.Id, l.Tipo, l.Descripcion, l.Cantidad, l.PrecioUnitario, l.TipoIva, l.Orden))
            .ToList(),
        f.CreatedAt);

    public static FacturaSummaryDto ToSummaryDto(this Factura f) => new(
        f.Id, f.ClienteId, f.NumeroCompleto, f.Estado, f.FechaEmision, f.Total);
}
