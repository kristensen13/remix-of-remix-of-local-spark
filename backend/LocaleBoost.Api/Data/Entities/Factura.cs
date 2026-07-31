namespace LocaleBoost.Api.Data.Entities;

public class Factura
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClienteId { get; set; }
    public Guid SerieId { get; set; }
    public int Numero { get; set; }
    public string NumeroCompleto { get; set; } = string.Empty;
    public EstadoFactura Estado { get; set; } = EstadoFactura.Emitida;
    public DateTime FechaEmision { get; set; }
    public DateTime? FechaVencimiento { get; set; }
    public decimal? PorcentajeRetencionIrpf { get; set; }
    public decimal BaseImponible { get; set; }
    public decimal TotalIva { get; set; }
    public decimal TotalRetencion { get; set; }
    public decimal Total { get; set; }
    public Guid? PresupuestoOrigenId { get; set; }
    public Guid? FacturaRectificadaId { get; set; }

    // Reservado para Verifactu (RD 1007/2023). No se calcula en esta versión;
    // el esquema queda preparado para no requerir migración destructiva cuando
    // se implemente el encadenamiento de registros de facturación.
    public string? HashRegistro { get; set; }
    public string? HashAnterior { get; set; }

    public string? PdfUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<LineaFactura> Lineas { get; set; } = new();
}
