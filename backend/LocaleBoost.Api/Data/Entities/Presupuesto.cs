namespace LocaleBoost.Api.Data.Entities;

public class Presupuesto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClienteId { get; set; }
    public string Numero { get; set; } = string.Empty;
    public EstadoPresupuesto Estado { get; set; } = EstadoPresupuesto.Borrador;
    public DateTime FechaEmision { get; set; }
    public DateTime? FechaValidez { get; set; }
    public string? Notas { get; set; }
    public Guid? FacturaId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public List<LineaPresupuesto> Lineas { get; set; } = new();
}
