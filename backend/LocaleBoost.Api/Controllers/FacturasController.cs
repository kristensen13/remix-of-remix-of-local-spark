using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Facturas;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/facturas")]
[Authorize]
public class FacturasController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFacturacionCalculoService _calculo;

    public FacturasController(AppDbContext db, IFacturacionCalculoService calculo)
    {
        _db = db;
        _calculo = calculo;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<List<FacturaSummaryDto>>> GetAll([FromQuery] Guid? clienteId)
    {
        var query = _db.Facturas.Where(f => f.UserId == CurrentUserId);

        if (clienteId is not null)
        {
            query = query.Where(f => f.ClienteId == clienteId);
        }

        var facturas = await query.OrderByDescending(f => f.FechaEmision).ToListAsync();

        return Ok(facturas.Select(f => f.ToSummaryDto()).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<FacturaDto>> GetById(Guid id)
    {
        var factura = await _db.Facturas
            .Include(f => f.Lineas)
            .SingleOrDefaultAsync(f => f.Id == id && f.UserId == CurrentUserId);

        if (factura is null)
        {
            return NotFound();
        }

        return Ok(factura.ToDto());
    }

    [HttpPost("{id:guid}/marcar-cobrada")]
    public async Task<ActionResult<FacturaDto>> MarcarCobrada(Guid id, MarcarCobradaRequest request)
    {
        var factura = await _db.Facturas
            .Include(f => f.Lineas)
            .SingleOrDefaultAsync(f => f.Id == id && f.UserId == CurrentUserId);

        if (factura is null)
        {
            return NotFound();
        }

        if (factura.Estado != EstadoFactura.Emitida)
        {
            return Conflict(new { message = "Solo se pueden marcar como cobradas facturas en estado Emitida." });
        }

        factura.Estado = EstadoFactura.Cobrada;
        factura.FechaCobro = request.FechaCobro;
        await _db.SaveChangesAsync();

        return Ok(factura.ToDto());
    }

    /// <summary>
    /// Anula una factura. No se borra (append-only): se marca como Anulada.
    /// Nota: fiscalmente, anular una factura ya emitida requiere normalmente una
    /// factura rectificativa (ver endpoint /rectificar), no un simple cambio de estado.
    /// Este endpoint cubre el caso de anulación antes de entrega/cobro; revisar con
    /// un asesor fiscal el criterio aplicable a tu caso.
    /// </summary>
    [HttpPost("{id:guid}/anular")]
    public async Task<ActionResult<FacturaDto>> Anular(Guid id)
    {
        var factura = await _db.Facturas
            .Include(f => f.Lineas)
            .SingleOrDefaultAsync(f => f.Id == id && f.UserId == CurrentUserId);

        if (factura is null)
        {
            return NotFound();
        }

        if (factura.Estado == EstadoFactura.Anulada)
        {
            return Conflict(new { message = "La factura ya está anulada." });
        }

        factura.Estado = EstadoFactura.Anulada;
        await _db.SaveChangesAsync();

        return Ok(factura.ToDto());
    }

    /// <summary>
    /// Crea una factura rectificativa vinculada a la original vía FacturaRectificadaId,
    /// con numeración propia tomada de una serie marcada como EsRectificativa = true.
    /// La factura original no se modifica (permanece inmutable).
    /// </summary>
    [HttpPost("{id:guid}/rectificar")]
    public async Task<ActionResult<FacturaDto>> Rectificar(Guid id, RectificarFacturaRequest request)
    {
        var original = await _db.Facturas.SingleOrDefaultAsync(f => f.Id == id && f.UserId == CurrentUserId);
        if (original is null)
        {
            return NotFound();
        }

        var serie = await _db.Series.SingleOrDefaultAsync(s =>
            s.Id == request.SerieRectificativaId && s.UserId == CurrentUserId);

        if (serie is null)
        {
            return BadRequest(new { message = "La serie indicada no existe." });
        }

        if (!serie.EsRectificativa)
        {
            return BadRequest(new { message = "La serie indicada no está marcada como rectificativa." });
        }

        if (request.LineasCorregidas is null || request.LineasCorregidas.Count == 0)
        {
            return BadRequest(new { message = "La factura rectificativa debe tener al menos una línea." });
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();

        serie.UltimoNumero += 1;
        var numeroAsignado = serie.UltimoNumero;
        var numeroCompleto = $"{serie.Codigo}-{serie.Anio}-{numeroAsignado:D5}";

        var totales = _calculo.CalcularTotales(
            request.LineasCorregidas.Select(l => (l.Cantidad, l.PrecioUnitario, l.TipoIva)),
            original.PorcentajeRetencionIrpf);

        var ahora = DateTime.UtcNow;

        var rectificativa = new Factura
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            ClienteId = original.ClienteId,
            SerieId = serie.Id,
            Numero = numeroAsignado,
            NumeroCompleto = numeroCompleto,
            Estado = EstadoFactura.Emitida,
            FechaEmision = ahora,
            PorcentajeRetencionIrpf = original.PorcentajeRetencionIrpf,
            BaseImponible = totales.BaseImponible,
            TotalIva = totales.TotalIva,
            TotalRetencion = totales.TotalRetencion,
            Total = totales.Total,
            FacturaRectificadaId = original.Id,
            CreatedAt = ahora,
            Lineas = request.LineasCorregidas.Select(l => new LineaFactura
            {
                Id = Guid.NewGuid(),
                Tipo = l.Tipo,
                Descripcion = l.Descripcion,
                Cantidad = l.Cantidad,
                PrecioUnitario = l.PrecioUnitario,
                TipoIva = l.TipoIva,
                Orden = l.Orden
            }).ToList()
        };

        _db.Facturas.Add(rectificativa);

        original.Estado = EstadoFactura.Rectificada;

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(rectificativa.ToDto());
    }
}
