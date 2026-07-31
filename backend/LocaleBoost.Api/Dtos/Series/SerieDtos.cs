using LocaleBoost.Api.Data.Entities;

namespace LocaleBoost.Api.Dtos.Series;

public record SerieDto(Guid Id, string Codigo, string? Descripcion, int UltimoNumero, int Anio, bool EsRectificativa);

public record CreateSerieRequest(string Codigo, string? Descripcion, int Anio, bool EsRectificativa);

public static class SerieMappingExtensions
{
    public static SerieDto ToDto(this Serie s) => new(s.Id, s.Codigo, s.Descripcion, s.UltimoNumero, s.Anio, s.EsRectificativa);
}
