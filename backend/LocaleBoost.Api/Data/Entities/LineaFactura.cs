namespace LocaleBoost.Api.Data.Entities;

public class LineaFactura
{
    public Guid Id { get; set; }
    public Guid FacturaId { get; set; }
    public TipoLinea Tipo { get; set; }
    public string Descripcion { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public TipoIva TipoIva { get; set; } = TipoIva.General21;
    public int Orden { get; set; }
}
