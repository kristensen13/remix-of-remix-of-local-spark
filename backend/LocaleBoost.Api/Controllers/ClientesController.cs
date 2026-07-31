using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Clientes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/clientes")]
[Authorize]
public class ClientesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ClientesController(AppDbContext db)
    {
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<List<ClienteDto>>> GetAll()
    {
        var clientes = await _db.Clientes
            .Where(c => c.UserId == CurrentUserId)
            .OrderBy(c => c.Nombre)
            .ToListAsync();

        return Ok(clientes.Select(c => c.ToDto()).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClienteDto>> GetById(Guid id)
    {
        var cliente = await _db.Clientes.SingleOrDefaultAsync(c => c.Id == id && c.UserId == CurrentUserId);

        if (cliente is null)
        {
            return NotFound();
        }

        return Ok(cliente.ToDto());
    }

    [HttpPost]
    public async Task<ActionResult<ClienteDto>> Create(CreateClienteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Nombre) || string.IsNullOrWhiteSpace(request.Nif))
        {
            return BadRequest(new { message = "Nombre y NIF son obligatorios." });
        }

        var cliente = new Cliente
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Nombre = request.Nombre,
            Nif = request.Nif,
            Direccion = request.Direccion,
            CodigoPostal = request.CodigoPostal,
            Ciudad = request.Ciudad,
            Provincia = request.Provincia,
            Pais = string.IsNullOrWhiteSpace(request.Pais) ? "España" : request.Pais,
            Email = request.Email,
            Telefono = request.Telefono,
            EsAutonomoOProfesional = request.EsAutonomoOProfesional,
            CreatedAt = DateTime.UtcNow
        };

        _db.Clientes.Add(cliente);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = cliente.Id }, cliente.ToDto());
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ClienteDto>> Update(Guid id, UpdateClienteRequest request)
    {
        var cliente = await _db.Clientes.SingleOrDefaultAsync(c => c.Id == id && c.UserId == CurrentUserId);

        if (cliente is null)
        {
            return NotFound();
        }

        cliente.Nombre = request.Nombre;
        cliente.Nif = request.Nif;
        cliente.Direccion = request.Direccion;
        cliente.CodigoPostal = request.CodigoPostal;
        cliente.Ciudad = request.Ciudad;
        cliente.Provincia = request.Provincia;
        cliente.Pais = string.IsNullOrWhiteSpace(request.Pais) ? cliente.Pais : request.Pais;
        cliente.Email = request.Email;
        cliente.Telefono = request.Telefono;
        cliente.EsAutonomoOProfesional = request.EsAutonomoOProfesional;

        await _db.SaveChangesAsync();

        return Ok(cliente.ToDto());
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var cliente = await _db.Clientes.SingleOrDefaultAsync(c => c.Id == id && c.UserId == CurrentUserId);

        if (cliente is null)
        {
            return NotFound();
        }

        var tieneFacturas = await _db.Facturas.AnyAsync(f => f.ClienteId == id);
        var tienePresupuestos = await _db.Presupuestos.AnyAsync(p => p.ClienteId == id);

        if (tieneFacturas || tienePresupuestos)
        {
            return Conflict(new { message = "No se puede eliminar un cliente con facturas o presupuestos asociados." });
        }

        _db.Clientes.Remove(cliente);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
