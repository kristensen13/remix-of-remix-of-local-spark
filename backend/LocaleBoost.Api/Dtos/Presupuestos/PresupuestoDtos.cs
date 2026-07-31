using LocaleBoost.Api.Data.Entities;

namespace LocaleBoost.Api.Dtos.Presupuestos;

public record LineaPresupuestoDto(
    Guid Id, TipoLinea Tipo, string Descripcion, decimal Cantidad, decimal PrecioUnitario, TipoIva TipoIva, int Orden);

public record LineaPresupuestoRequest(
    TipoLinea Tipo, string Descripcion, decimal Cantidad, decimal PrecioUnitario, TipoIva TipoIva, int Orden);

public record PresupuestoDto(
    Guid Id,
    Guid ClienteId,
    string Numero,
    EstadoPresupuesto Estado,
    DateTime FechaEmision,
    DateTime? FechaValidez,
    string? Notas,
    Guid? FacturaId,
    List<LineaPresupuestoDto> Lineas,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record PresupuestoSummaryDto(
    Guid Id, Guid ClienteId, string Numero, EstadoPresupuesto Estado, DateTime FechaEmision, int NumeroLineas);

public record CreatePresupuestoRequest(
    Guid ClienteId,
    string Numero,
    DateTime? FechaValidez,
    string? Notas,
    List<LineaPresupuestoRequest> Lineas);

public record UpdatePresupuestoRequest(
    DateTime? FechaValidez,
    string? Notas,
    List<LineaPresupuestoRequest> Lineas);

public record CambiarEstadoPresupuestoRequest(EstadoPresupuesto Estado);

public record ConvertirAFacturaRequest(Guid SerieId, decimal? PorcentajeRetencionIrpf);

public static class PresupuestoMappingExtensions
{
    public static PresupuestoDto ToDto(this Presupuesto p) => new(
        p.Id, p.ClienteId, p.Numero, p.Estado, p.FechaEmision, p.FechaValidez, p.Notas, p.FacturaId,
        p.Lineas.OrderBy(l => l.Orden)
            .Select(l => new LineaPresupuestoDto(l.Id, l.Tipo, l.Descripcion, l.Cantidad, l.PrecioUnitario, l.TipoIva, l.Orden))
            .ToList(),
        p.CreatedAt, p.UpdatedAt);

    public static PresupuestoSummaryDto ToSummaryDto(this Presupuesto p) => new(
        p.Id, p.ClienteId, p.Numero, p.Estado, p.FechaEmision, p.Lineas.Count);
}
