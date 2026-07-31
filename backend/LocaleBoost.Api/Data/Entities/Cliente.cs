namespace LocaleBoost.Api.Data.Entities;

public class Cliente
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Nif { get; set; } = string.Empty;
    public string Direccion { get; set; } = string.Empty;
    public string? CodigoPostal { get; set; }
    public string? Ciudad { get; set; }
    public string? Provincia { get; set; }
    public string Pais { get; set; } = "España";
    public string? Email { get; set; }
    public string? Telefono { get; set; }
    public bool EsAutonomoOProfesional { get; set; }
    public DateTime CreatedAt { get; set; }
}
