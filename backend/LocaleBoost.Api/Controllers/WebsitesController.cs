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
    private readonly IWebsiteFetcherService _websiteFetcher;
    private readonly AppDbContext _db;

    public WebsitesController(IClaudeService claude, IWebsiteFetcherService websiteFetcher, AppDbContext db)
    {
        _claude = claude;
        _websiteFetcher = websiteFetcher;
        _db = db;
    }

    protected Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

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

        string generatedContent;
        string? auditSummary = null;
        string? sourceWebsiteUrl = null;

        if (!string.IsNullOrWhiteSpace(result.WebsiteUrl))
        {
            var existingHtml = await _websiteFetcher.FetchHtmlAsync(result.WebsiteUrl);
            var audit = await _claude.AuditAndProposeWebsiteAsync(result.Name, result.Address, result.Phone, existingHtml);
            generatedContent = audit.ProposedHtml;
            auditSummary = audit.AuditSummary;
            sourceWebsiteUrl = result.WebsiteUrl;
        }
        else
        {
            generatedContent = await _claude.GenerateWebsiteHtmlAsync(result.Name, result.Address, result.Phone);
        }

        var website = new GeneratedWebsite
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            BusinessName = result.Name,
            BusinessAddress = result.Address,
            BusinessPhone = result.Phone,
            GeneratedContent = generatedContent,
            AuditSummary = auditSummary,
            SourceWebsiteUrl = sourceWebsiteUrl,
            CreatedAt = DateTime.UtcNow
        };

        _db.GeneratedWebsites.Add(website);
        await _db.SaveChangesAsync();

        return Ok(new GeneratedWebsiteDto(
            website.Id, website.BusinessName, website.BusinessAddress,
            website.BusinessPhone, website.GeneratedContent, website.AuditSummary, website.SourceWebsiteUrl,
            website.CreatedAt));
    }

    [HttpGet]
    public async Task<ActionResult<List<GeneratedWebsiteDto>>> GetAll()
    {
        var websites = await _db.GeneratedWebsites
            .Where(w => w.UserId == CurrentUserId)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new GeneratedWebsiteDto(
                w.Id, w.BusinessName, w.BusinessAddress, w.BusinessPhone,
                w.GeneratedContent, w.AuditSummary, w.SourceWebsiteUrl, w.CreatedAt))
            .ToListAsync();

        return Ok(websites);
    }
}
