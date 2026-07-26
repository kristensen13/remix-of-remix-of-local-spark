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
        var inviteCode = await _db.InviteCodes
            .SingleOrDefaultAsync(c => c.Code == request.InviteCode && !c.IsUsed);

        if (inviteCode is null)
        {
            return BadRequest(new { message = "Invalid or already used invite code." });
        }

        var user = new IdentityUser<Guid> { Id = Guid.NewGuid(), UserName = request.Email, Email = request.Email };
        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join("; ", result.Errors.Select(e => e.Description)) });
        }

        inviteCode.IsUsed = true;
        inviteCode.UsedByUserId = user.Id;
        inviteCode.UsedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

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
