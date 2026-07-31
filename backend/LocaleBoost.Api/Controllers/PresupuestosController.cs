using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Facturas;
using LocaleBoost.Api.Dtos.Presupuestos;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/presupuestos")]
[Authorize]
public class PresupuestosController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFacturacionCalculoService _calculo;

    public PresupuestosController(AppDbContext db, IFacturacionCalculoService calculo)
    {
        _db = db;
        _calculo = calculo;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<List<PresupuestoSummaryDto>>> GetAll()
    {
        var presupuestos = await _db.Presupuestos
            .Include(p => p.Lineas)
            .Where(p => p.UserId == CurrentUserId)
            .OrderByDescending(p => p.FechaEmision)
            .ToListAsync();

        return Ok(presupuestos.Select(p => p.ToSummaryDto()).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PresupuestoDto>> GetById(Guid id)
    {
        var presupuesto = await _db.Presupuestos
            .Include(p => p.Lineas)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);

        if (presupuesto is null)
        {
            return NotFound();
        }

        return Ok(presupuesto.ToDto());
    }

    [HttpPost]
    public async Task<ActionResult<PresupuestoDto>> Create(CreatePresupuestoRequest request)
    {
        var clienteExiste = await _db.Clientes.AnyAsync(c => c.Id == request.ClienteId && c.UserId == CurrentUserId);
        if (!clienteExiste)
        {
            return BadRequest(new { message = "El cliente indicado no existe." });
        }

        if (request.Lineas is null || request.Lineas.Count == 0)
        {
            return BadRequest(new { message = "El presupuesto debe tener al menos una línea." });
        }

        var ahora = DateTime.UtcNow;

        var presupuesto = new Presupuesto
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            ClienteId = request.ClienteId,
            Numero = request.Numero,
            Estado = EstadoPresupuesto.Borrador,
            FechaEmision = ahora,
            FechaValidez = request.FechaValidez,
            Notas = request.Notas,
            CreatedAt = ahora,
            UpdatedAt = ahora,
            Lineas = request.Lineas.Select(l => new LineaPresupuesto
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

        _db.Presupuestos.Add(presupuesto);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = presupuesto.Id }, presupuesto.ToDto());
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PresupuestoDto>> Update(Guid id, UpdatePresupuestoRequest request)
    {
        var presupuesto = await _db.Presupuestos
            .Include(p => p.Lineas)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);

        if (presupuesto is null)
        {
            return NotFound();
        }

        if (presupuesto.Estado != EstadoPresupuesto.Borrador)
        {
            return Conflict(new { message = "Solo se pueden editar presupuestos en estado Borrador." });
        }

        presupuesto.FechaValidez = request.FechaValidez;
        presupuesto.Notas = request.Notas;
        presupuesto.UpdatedAt = DateTime.UtcNow;

        _db.LineasPresupuesto.RemoveRange(presupuesto.Lineas);
        presupuesto.Lineas = request.Lineas.Select(l => new LineaPresupuesto
        {
            Id = Guid.NewGuid(),
            PresupuestoId = presupuesto.Id,
            Tipo = l.Tipo,
            Descripcion = l.Descripcion,
            Cantidad = l.Cantidad,
            PrecioUnitario = l.PrecioUnitario,
            TipoIva = l.TipoIva,
            Orden = l.Orden
        }).ToList();

        await _db.SaveChangesAsync();

        return Ok(presupuesto.ToDto());
    }

    [HttpPost("{id:guid}/estado")]
    public async Task<ActionResult<PresupuestoDto>> CambiarEstado(Guid id, CambiarEstadoPresupuestoRequest request)
    {
        var presupuesto = await _db.Presupuestos
            .Include(p => p.Lineas)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);

        if (presupuesto is null)
        {
            return NotFound();
        }

        if (presupuesto.Estado == EstadoPresupuesto.Aceptado && presupuesto.FacturaId is not null)
        {
            return Conflict(new { message = "El presupuesto ya fue convertido en factura y no se puede modificar." });
        }

        presupuesto.Estado = request.Estado;
        presupuesto.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(presupuesto.ToDto());
    }

    /// <summary>
    /// Convierte un presupuesto Aceptado en una Factura inmutable: copia las líneas,
    /// asigna el siguiente número correlativo de la Serie indicada (incremento atómico)
    /// y calcula los totales (base imponible, IVA, retención IRPF).
    /// </summary>
    [HttpPost("{id:guid}/convertir-a-factura")]
    public async Task<ActionResult<FacturaDto>> ConvertirAFactura(Guid id, ConvertirAFacturaRequest request)
    {
        var presupuesto = await _db.Presupuestos
            .Include(p => p.Lineas)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == CurrentUserId);

        if (presupuesto is null)
        {
            return NotFound();
        }

        if (presupuesto.Estado != EstadoPresupuesto.Aceptado)
        {
            return Conflict(new { message = "Solo se pueden convertir presupuestos en estado Aceptado." });
        }

        if (presupuesto.FacturaId is not null)
        {
            return Conflict(new { message = "Este presupuesto ya fue convertido en factura." });
        }

        var serie = await _db.Series.SingleOrDefaultAsync(s => s.Id == request.SerieId && s.UserId == CurrentUserId);
        if (serie is null)
        {
            return BadRequest(new { message = "La serie indicada no existe." });
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();

        // Incremento atómico del contador de la serie para garantizar numeración correlativa.
        serie.UltimoNumero += 1;
        var numeroAsignado = serie.UltimoNumero;
        var numeroCompleto = $"{serie.Codigo}-{serie.Anio}-{numeroAsignado:D5}";

        var totales = _calculo.CalcularTotales(
            presupuesto.Lineas.Select(l => (l.Cantidad, l.PrecioUnitario, l.TipoIva)),
            request.PorcentajeRetencionIrpf);

        var ahora = DateTime.UtcNow;

        var factura = new Factura
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            ClienteId = presupuesto.ClienteId,
            SerieId = serie.Id,
            Numero = numeroAsignado,
            NumeroCompleto = numeroCompleto,
            Estado = EstadoFactura.Emitida,
            FechaEmision = ahora,
            PorcentajeRetencionIrpf = request.PorcentajeRetencionIrpf,
            BaseImponible = totales.BaseImponible,
            TotalIva = totales.TotalIva,
            TotalRetencion = totales.TotalRetencion,
            Total = totales.Total,
            PresupuestoOrigenId = presupuesto.Id,
            CreatedAt = ahora,
            Lineas = presupuesto.Lineas.Select(l => new LineaFactura
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

        _db.Facturas.Add(factura);

        presupuesto.FacturaId = factura.Id;
        presupuesto.UpdatedAt = ahora;

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(factura.ToDto());
    }
}
