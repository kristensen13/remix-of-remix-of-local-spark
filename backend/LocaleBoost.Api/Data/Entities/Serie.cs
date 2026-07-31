namespace LocaleBoost.Api.Data.Entities;

public class Serie
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public int UltimoNumero { get; set; }
    public int Anio { get; set; }
    public bool EsRectificativa { get; set; }
}
