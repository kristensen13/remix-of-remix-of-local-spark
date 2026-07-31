using LocaleBoost.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LocaleBoost.Api.Data;

public class AppDbContext : IdentityDbContext<IdentityUser<Guid>, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<InviteCode> InviteCodes => Set<InviteCode>();
    public DbSet<BusinessSearch> BusinessSearches => Set<BusinessSearch>();
    public DbSet<BusinessSearchResult> BusinessSearchResults => Set<BusinessSearchResult>();
    public DbSet<GeneratedWebsite> GeneratedWebsites => Set<GeneratedWebsite>();

    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Serie> Series => Set<Serie>();
    public DbSet<Presupuesto> Presupuestos => Set<Presupuesto>();
    public DbSet<LineaPresupuesto> LineasPresupuesto => Set<LineaPresupuesto>();
    public DbSet<Factura> Facturas => Set<Factura>();
    public DbSet<LineaFactura> LineasFactura => Set<LineaFactura>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<InviteCode>()
            .HasIndex(i => i.Code)
            .IsUnique();

        builder.Entity<BusinessSearch>()
            .HasMany(s => s.Results)
            .WithOne()
            .HasForeignKey(r => r.BusinessSearchId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<InviteCode>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(i => i.UsedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Entity<BusinessSearch>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<GeneratedWebsite>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(w => w.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // --- Facturación: Cliente ---
        builder.Entity<Cliente>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // --- Facturación: Serie ---
        builder.Entity<Serie>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<Serie>()
            .HasIndex(s => new { s.UserId, s.Codigo, s.Anio })
            .IsUnique();

        // --- Facturación: Presupuesto ---
        builder.Entity<Presupuesto>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<Presupuesto>()
            .HasOne<Cliente>()
            .WithMany()
            .HasForeignKey(p => p.ClienteId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Presupuesto>()
            .HasMany(p => p.Lineas)
            .WithOne()
            .HasForeignKey(l => l.PresupuestoId)
            .OnDelete(DeleteBehavior.Cascade);

        // Presupuesto <-> Factura: relación 0..1—0..1 sin acción en cascada
        // (no queremos borrar una factura emitida al borrar su presupuesto origen).
        builder.Entity<Presupuesto>()
            .HasOne<Factura>()
            .WithOne()
            .HasForeignKey<Presupuesto>(p => p.FacturaId)
            .OnDelete(DeleteBehavior.SetNull);

        // --- Facturación: Factura ---
        builder.Entity<Factura>()
            .HasOne<IdentityUser<Guid>>()
            .WithMany()
            .HasForeignKey(f => f.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<Factura>()
            .HasOne<Cliente>()
            .WithMany()
            .HasForeignKey(f => f.ClienteId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Factura>()
            .HasOne<Serie>()
            .WithMany()
            .HasForeignKey(f => f.SerieId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Factura>()
            .HasIndex(f => new { f.SerieId, f.Numero })
            .IsUnique();

        builder.Entity<Factura>()
            .HasOne<Presupuesto>()
            .WithOne()
            .HasForeignKey<Factura>(f => f.PresupuestoOrigenId)
            .OnDelete(DeleteBehavior.SetNull);

        // Auto-referencia para rectificativas.
        builder.Entity<Factura>()
            .HasOne<Factura>()
            .WithMany()
            .HasForeignKey(f => f.FacturaRectificadaId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Factura>()
            .HasMany(f => f.Lineas)
            .WithOne()
            .HasForeignKey(l => l.FacturaId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
