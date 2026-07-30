using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LocaleBoost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWebsiteStatusAndAuditFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AuditSummary",
                table: "GeneratedWebsites",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceWebsiteUrl",
                table: "GeneratedWebsites",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WebsiteUrl",
                table: "BusinessSearchResults",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AuditSummary",
                table: "GeneratedWebsites");

            migrationBuilder.DropColumn(
                name: "SourceWebsiteUrl",
                table: "GeneratedWebsites");

            migrationBuilder.DropColumn(
                name: "WebsiteUrl",
                table: "BusinessSearchResults");
        }
    }
}
