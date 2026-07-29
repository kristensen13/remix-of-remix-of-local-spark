# --- Stage 1: build the Angular frontend ---
FROM node:22-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build and publish the .NET backend ---
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY backend/LocaleBoost.Api/LocaleBoost.Api.csproj backend/LocaleBoost.Api/
RUN dotnet restore backend/LocaleBoost.Api/LocaleBoost.Api.csproj
COPY backend/LocaleBoost.Api/ backend/LocaleBoost.Api/
RUN dotnet publish backend/LocaleBoost.Api/LocaleBoost.Api.csproj -c Release -o /app/publish --no-restore

# --- Stage 3: runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend-build /src/frontend/dist/frontend/browser ./wwwroot

ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["/bin/sh", "-c", "exec dotnet LocaleBoost.Api.dll --urls http://+:${PORT:-8080}"]
