using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LocaleBoost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFacturaFechaCobro : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FechaCobro",
                table: "Facturas",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FechaCobro",
                table: "Facturas");
        }
    }
}
