using System.Security.Claims;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Data.Entities;
using LocaleBoost.Api.Dtos.Websites;
using LocaleBoost.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/websites")]
[Authorize]
public class WebsitesController : ControllerBase
{
    private readonly IClaudeService _claude;
    private readonly AppDbContext _db;

    public WebsitesController(IClaudeService claude, AppDbContext db)
    {
        _claude = claude;
        _db = db;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpPost("generate")]
    public async Task<ActionResult<GeneratedWebsiteDto>> Generate(GenerateWebsiteRequest request)
    {
        var result = await _db.BusinessSearchResults
            .Join(_db.BusinessSearches,
                r => r.BusinessSearchId,
                s => s.Id,
                (r, s) => new { Result = r, Search = s })
            .Where(x => x.Result.Id == request.BusinessSearchResultId && x.Search.UserId == CurrentUserId)
            .Select(x => x.Result)
            .SingleOrDefaultAsync();

        if (result is null)
        {
            return NotFound();
        }

        var html = await _claude.GenerateWebsiteHtmlAsync(result.Name, result.Address, result.Phone);

        var website = new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            BusinessName = result.Name,
            BusinessAddress = result.Address,
            BusinessPhone = result.Phone,
            GeneratedContent = html,
            CreatedAt = DateTime.UtcNow
        };

        _db.GeneratedWebsites.Add(website);
        await _db.SaveChangesAsync();

        return Ok(new GeneratedWebsiteDto(
            website.Id, website.BusinessName, website.BusinessAddress,
            website.BusinessPhone, website.GeneratedContent, website.CreatedAt));
    }

    [HttpGet]
    public async Task<ActionResult<List<GeneratedWebsiteDto>>> GetAll()
    {
        var websites = await _db.GeneratedWebsites
            .Where(w => w.UserId == CurrentUserId)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new GeneratedWebsiteDto(
                w.Id, w.BusinessName, w.BusinessAddress, w.BusinessPhone, w.GeneratedContent, w.CreatedAt))
            .ToListAsync();

        return Ok(websites);
    }
}
