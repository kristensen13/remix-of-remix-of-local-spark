using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/businesses")]
[Authorize]
public class BusinessesController : ControllerBase
{
    private readonly IGoogleMapsService _googleMaps;
    private readonly AppDbContext _db;

    public BusinessesController(IGoogleMapsService googleMaps, AppDbContext db)
    {
        _googleMaps = googleMaps;
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("search")]
    public async Task<ActionResult<BusinessSearchResponse>> Search(
        [FromQuery] string query, [FromQuery] string? location)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "El término de búsqueda es obligatorio." });
        }

        var places = await _googleMaps.SearchBusinessesWithoutWebsiteAsync(query, location);

        var search = new BusinessSearch
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Query = query,
            Location = location,
            CreatedAt = DateTime.UtcNow,
            Results = places.Select(p => new BusinessSearchResult
            {
                Id = Guid.NewGuid(),
                PlaceId = p.PlaceId,
                Name = p.Name,
                Address = p.Address,
                Phone = p.Phone,
                HasWebsite = p.HasWebsite
            }).ToList()
        };

        _db.BusinessSearches.Add(search);
        await _db.SaveChangesAsync();

        return Ok(new BusinessSearchResponse(
            search.Id,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone))
                .ToList()));
    }

    [HttpGet("searches")]
    public async Task<ActionResult<List<BusinessSearchSummaryDto>>> GetSearches()
    {
        var searches = await _db.BusinessSearches
            .Where(s => s.UserId == CurrentUserId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new BusinessSearchSummaryDto(s.Id, s.Query, s.Location, s.CreatedAt, s.Results.Count))
            .ToListAsync();

        return Ok(searches);
    }

    [HttpGet("searches/{id:guid}")]
    public async Task<ActionResult<BusinessSearchDetailDto>> GetSearchById(Guid id)
    {
        var search = await _db.BusinessSearches
            .Include(s => s.Results)
            .SingleOrDefaultAsync(s => s.Id == id && s.UserId == CurrentUserId);

        if (search is null)
        {
            return NotFound();
        }

        return Ok(new BusinessSearchDetailDto(
            search.Id,
            search.Query,
            search.Location,
            search.CreatedAt,
            search.Results
                .Select(r => new BusinessSearchResultDto(r.Id, r.PlaceId, r.Name, r.Address, r.Phone))
                .ToList()));
    }
}
