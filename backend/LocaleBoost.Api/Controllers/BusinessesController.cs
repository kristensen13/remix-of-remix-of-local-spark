using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Businesses;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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
            return BadRequest(new { message = "Query is required." });
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
}
