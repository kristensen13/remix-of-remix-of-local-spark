using LocaleBoost.Api.Auth;
using LocaleBoost.Api.Data;
using LocaleBoost.Api.Dtos.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<IdentityUser<Guid>> _userManager;
    private readonly AppDbContext _db;
    private readonly JwtTokenService _tokenService;

    public AuthController(UserManager<IdentityUser<Guid>> userManager, AppDbContext db, JwtTokenService tokenService)
    {
        _userManager = userManager;
        _db = db;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        // Atomically claim the invite code: the unused -> used transition happens as a single
        // conditional UPDATE at the database level, so only one of two concurrent requests
        // racing on the same code can ever affect a row. SingleOrDefaultAsync + a later write
        // would let both requests pass the read-check before either commits.
        var claimed = await _db.InviteCodes
            .Where(c => c.Code == request.InviteCode && !c.IsUsed)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(c => c.IsUsed, true)
                .SetProperty(c => c.UsedAt, DateTime.UtcNow));

        if (claimed == 0)
        {
            return BadRequest(new { message = "Invalid or already used invite code." });
        }

        var user = new IdentityUser<Guid> { Id = Guid.NewGuid(), UserName = request.Email, Email = request.Email };
        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            // The invite code was already claimed above, but the user was never created.
            // Release the claim so the code isn't permanently burned by a failed registration
            // (e.g. duplicate email, weak password) — it should remain usable by someone else.
            await _db.InviteCodes
                .Where(c => c.Code == request.InviteCode)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(c => c.IsUsed, false)
                    .SetProperty(c => c.UsedAt, (DateTime?)null));

            return BadRequest(new { message = string.Join("; ", result.Errors.Select(e => e.Description)) });
        }

        await _db.InviteCodes
            .Where(c => c.Code == request.InviteCode)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.UsedByUserId, user.Id));

        var token = _tokenService.CreateToken(user);
        return Ok(new AuthResponse(token));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        var token = _tokenService.CreateToken(user);
        return Ok(new AuthResponse(token));
    }
}
