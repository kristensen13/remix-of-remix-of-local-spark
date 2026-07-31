using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Series;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/series")]
[Authorize]
public class SeriesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SeriesController(AppDbContext db)
    {
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<List<SerieDto>>> GetAll()
    {
        var series = await _db.Series
            .Where(s => s.UserId == CurrentUserId)
            .OrderByDescending(s => s.Anio)
            .ThenBy(s => s.Codigo)
            .ToListAsync();

        return Ok(series.Select(s => s.ToDto()).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<SerieDto>> Create(CreateSerieRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Codigo))
        {
            return BadRequest(new { message = "El código de serie es obligatorio." });
        }

        var yaExiste = await _db.Series.AnyAsync(s =>
            s.UserId == CurrentUserId && s.Codigo == request.Codigo && s.Anio == request.Anio);

        if (yaExiste)
        {
            return Conflict(new { message = "Ya existe una serie con ese código para ese año." });
        }

        var serie = new Serie
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Codigo = request.Codigo,
            Descripcion = request.Descripcion,
            Anio = request.Anio,
            EsRectificativa = request.EsRectificativa,
            UltimoNumero = 0
        };

        _db.Series.Add(serie);
        await _db.SaveChangesAsync();

        return Ok(serie.ToDto());
    }
}
