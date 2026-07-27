using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LocaleBoost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserForeignKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_InviteCodes_UsedByUserId",
                table: "InviteCodes",
                column: "UsedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_GeneratedWebsites_UserId",
                table: "GeneratedWebsites",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessSearches_UserId",
                table: "BusinessSearches",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_BusinessSearches_AspNetUsers_UserId",
                table: "BusinessSearches",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_GeneratedWebsites_AspNetUsers_UserId",
                table: "GeneratedWebsites",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_InviteCodes_AspNetUsers_UsedByUserId",
                table: "InviteCodes",
                column: "UsedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BusinessSearches_AspNetUsers_UserId",
                table: "BusinessSearches");

            migrationBuilder.DropForeignKey(
                name: "FK_GeneratedWebsites_AspNetUsers_UserId",
                table: "GeneratedWebsites");

            migrationBuilder.DropForeignKey(
                name: "FK_InviteCodes_AspNetUsers_UsedByUserId",
                table: "InviteCodes");

            migrationBuilder.DropIndex(
                name: "IX_InviteCodes_UsedByUserId",
                table: "InviteCodes");

            migrationBuilder.DropIndex(
                name: "IX_GeneratedWebsites_UserId",
                table: "GeneratedWebsites");

            migrationBuilder.DropIndex(
                name: "IX_BusinessSearches_UserId",
                table: "BusinessSearches");
        }
    }
}
