using LocaleBoost.Api.Data.Entities;

namespace LocaleBoost.Api.Dtos.Clientes;

public record ClienteDto(
    Guid Id,
    string Nombre,
    string Nif,
    string Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string Pais,
    string? Email,
    string? Telefono,
    bool EsAutonomoOProfesional,
    DateTime CreatedAt);

public record CreateClienteRequest(
    string Nombre,
    string Nif,
    string Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string? Pais,
    string? Email,
    string? Telefono,
    bool EsAutonomoOProfesional);

public record UpdateClienteRequest(
    string Nombre,
    string Nif,
    string Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string? Pais,
    string? Email,
    string? Telefono,
    bool EsAutonomoOProfesional);

public static class ClienteMappingExtensions
{
    public static ClienteDto ToDto(this Cliente c) => new(
        c.Id, c.Nombre, c.Nif, c.Direccion, c.CodigoPostal, c.Ciudad, c.Provincia,
        c.Pais, c.Email, c.Telefono, c.EsAutonomoOProfesional, c.CreatedAt);
}
