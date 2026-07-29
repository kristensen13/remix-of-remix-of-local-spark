# Localización a castellano + estado de sitio web y auditoría en resultados

## Context

LocaleBoost está en producción (Railway) y probado end-to-end por el dueño del producto. Dos cambios pedidos tras la primera prueba real:

1. Toda la app está en inglés (interfaz Angular, mensajes de error del backend, y el contenido que genera Claude). El producto es para negocios hispanohablantes — necesita estar en castellano.
2. La búsqueda descarta automáticamente cualquier negocio que ya tenga sitio web (era la premisa original del producto: solo mostrar negocios *sin* sitio). Ahora se quiere poder ver también los que sí tienen, con su estado y enlace — y para esos, en vez de generar un sitio desde cero, hacer una auditoría del sitio existente y proponer una versión mejorada (diseño + SEO).

## Goals

1. Todo el texto visible por el usuario (interfaz + mensajes de error + contenido generado por Claude) en castellano. Sin infraestructura de i18n/selector de idioma — es un solo idioma fijo.
2. La búsqueda admite un modo opcional que incluye negocios con sitio web; cada resultado (en la búsqueda y en el historial) muestra si tiene sitio y, si lo tiene, su enlace.
3. Al pedir "generar" sobre un resultado que ya tiene sitio, el backend audita el sitio existente (SEO, diseño, velocidad, mobile) y propone una versión HTML mejorada — ambas cosas se guardan y se muestran juntas.

Explícitamente fuera de alcance:
- Selector de idioma / multi-idioma (siempre castellano).
- Análisis de SEO con herramientas externas (Lighthouse, PageSpeed API, etc.) — la auditoría es puramente lo que Claude puede inferir del HTML fetcheado.
- Rastrear más de una página del sitio existente (solo se audita la URL que devuelve Google Places, no todo el sitio).
- Botón para "aceptar" la propuesta y reemplazar el sitio real del negocio — la propuesta queda solo como contenido para mostrarle al dueño del negocio, igual que el flujo actual de generación.

## Architecture

Sin cambios de arquitectura: sigue siendo un único servicio ASP.NET Core sirviendo `/api/*` y el build de Angular, con PostgreSQL vía EF Core. Los cambios son:

- Un nuevo servicio backend, `IWebsiteFetcherService`, que hace un `GET` HTTP al sitio existente de un negocio (cuando corresponde) y devuelve su HTML — con timeout y tope de tamaño, para no colgar el request ni mandarle a Claude un documento gigante.
- `IGoogleMapsService` deja de filtrar incondicionalmente los resultados con sitio web; el filtro pasa a ser un parámetro.
- `IClaudeService` gana un segundo método para el flujo de auditoría (una sola llamada a Claude que devuelve auditoría + HTML propuesto en JSON).
- El endpoint `POST /api/websites/generate` no cambia de forma (sigue recibiendo solo el id del resultado) — el backend decide internamente si genera desde cero o audita, según si ese resultado tiene una URL de sitio guardada.

```
[Angular SPA] <-> [ASP.NET Core API] <-> [PostgreSQL]
                        |        |
                [Google Maps]  [Claude]
                        |
              [sitio web del negocio] (fetch HTML, solo cuando hay uno)
```

## 1. Localización a castellano

Reemplazo directo de texto — sin librería de i18n, sin archivos de traducción separados, sin build por locale. Cada string en inglés se reescribe en castellano, in place.

**Frontend (6 templates):**

| Archivo | Cambios |
|---|---|
| `login.html` | "Log in"→"Iniciar sesión", "Register"→"Registrarse", "Email"→"Correo electrónico", "Password"→"Contraseña", "Password (min 8 characters)"→"Contraseña (mín. 8 caracteres)", "Invite code"→"Código de invitación", "Logging in…"→"Iniciando sesión…", "Registering…"→"Registrando…" |
| `business-search.html` | "Search for businesses without a website"→"Buscar negocios locales", "e.g. plumbers"→"ej. plomeros", "Location (optional)"→"Ubicación (opcional)", "Searching…"→"Buscando…", "Search"→"Buscar", "Generating…"→"Generando…", "No results yet — run a search above."→"Todavía no hay resultados — hacé una búsqueda arriba." |
| `search-history.html` | "Past searches"→"Búsquedas anteriores", "Loading…"→"Cargando…", "No searches yet."→"Todavía no hay búsquedas.", "result(s)"→"resultado(s)" |
| `generated-websites.html` | "Generated websites"→"Sitios generados", "Loading…"→"Cargando…", "No generated websites yet."→"Todavía no hay sitios generados.", "Preview"→"Vista previa", "Close"→"Cerrar" |
| `layout.html` | "Search"→"Buscar", "History"→"Historial", "Websites"→"Sitios", "Log out"→"Cerrar sesión" |
| `not-found.html` | "Page not found"→"Página no encontrada", "Back to search"→"Volver a la búsqueda" |

**Frontend (mensaje genérico de error):** `core/http-error.util.ts` — `"An unexpected error occurred. Please try again."` → `"Ocurrió un error inesperado. Intentá de nuevo."`

**Backend (mensajes que ya viajan al usuario vía `message`/`title`):**

| Archivo:línea | Actual | Nuevo |
|---|---|---|
| `AuthController.cs:40` | "Invalid or already used invite code." | "El código de invitación no es válido o ya fue usado." |
| `AuthController.cs:57` | "Registration failed. Please check your details and try again." | "No se pudo completar el registro. Revisá tus datos e intentá de nuevo." |
| `AuthController.cs:74` | "Invalid email or password." | "Correo electrónico o contraseña incorrectos." |
| `BusinessesController.cs:34` | "Query is required." | "El término de búsqueda es obligatorio." |
| `GoogleMapsService.cs` (`ExternalServiceException`) | "Couldn't complete the search, try again." | "No se pudo completar la búsqueda, intentá de nuevo." |
| `ClaudeService.cs` (`ExternalServiceException`) | "Couldn't generate the website, try again." | "No se pudo generar el sitio web, intentá de nuevo." |
| `ExceptionHandlingMiddleware.cs` (500 genérico) | "An unexpected error occurred." | "Ocurrió un error inesperado." |

**Contenido generado por Claude:** el prompt de `GenerateWebsiteHtmlAsync` (generación desde cero) y el nuevo prompt de auditoría (abajo) incluyen la instrucción explícita de responder en castellano — tanto el HTML generado como el informe de auditoría.

## 2. Búsqueda: estado de sitio web en los resultados

**`IGoogleMapsService`** (`backend/LocaleBoost.Api/Services/GoogleMapsService.cs`):

- `GoogleMapsPlace` cambia de `(string PlaceId, string Name, string Address, string? Phone, bool HasWebsite)` a `(string PlaceId, string Name, string Address, string? Phone, string? WebsiteUrl)` — `HasWebsite` se deriva de `WebsiteUrl` más adelante en el flujo, no se guarda como booleano redundante en este record.
- El método se renombra de `SearchBusinessesWithoutWebsiteAsync` a `SearchBusinessesAsync(string query, string? location, bool includeWithWebsite, CancellationToken cancellationToken = default)` — el nombre viejo ya no describe lo que hace.
- El filtro `.Where(p => string.IsNullOrWhiteSpace(p.WebsiteUri))` se vuelve condicional: se aplica solo si `includeWithWebsite == false`. Cuando es `true`, se devuelven todos los resultados, cada uno con su `WebsiteUrl` (puede ser `null` si no tiene).
- `IGoogleMapsService` se actualiza con la nueva firma.

**`BusinessesController.Search`** (`backend/LocaleBoost.Api/Controllers/BusinessesController.cs`):

- Nuevo parámetro `[FromQuery] bool includeWithWebsite = false`.
- Al mapear `GoogleMapsPlace` → `BusinessSearchResult`: `WebsiteUrl = p.WebsiteUrl`, `HasWebsite = !string.IsNullOrWhiteSpace(p.WebsiteUrl)`.

**Data model** — `BusinessSearchResult` (`backend/LocaleBoost.Api/Data/Entities/BusinessSearchResult.cs`): nueva propiedad `public string? WebsiteUrl { get; set; }`. `HasWebsite` ya existe como columna pero hasta ahora siempre se guardaba en `false`; pasa a reflejar la realidad. Migración EF Core nueva para la columna.

**DTOs** (`backend/LocaleBoost.Api/Dtos/Businesses/BusinessSearchResultDto.cs`): `BusinessSearchResultDto` gana `bool HasWebsite` y `string? WebsiteUrl`. Se usa en las tres respuestas que ya devuelven este DTO (`BusinessSearchResponse`, `BusinessSearchSummaryDto` no lo incluye — no cambia —, `BusinessSearchDetailDto` sí).

**Frontend:**

- `core/models/business.models.ts`: `BusinessSearchResult` gana `hasWebsite: boolean` y `websiteUrl: string | null`.
- `business-search.service.ts`: `search(query, location, includeWithWebsite)` — nuevo parámetro, se manda como query param `includeWithWebsite` cuando es `true` (se omite cuando es `false`, igual que `location`).
- `business-search.ts` / `.html`: nuevo signal `includeWithWebsite` atado a un `<input type="checkbox">` con label "Incluir negocios que ya tienen sitio web"; cada `<li>` de resultado agrega, después del teléfono: si `result.hasWebsite`, un enlace `<a [href]="result.websiteUrl" target="_blank" rel="noopener">Ver sitio actual</a>`; si no, el texto "Sin sitio web".
- `search-history.html`: el detalle de una búsqueda pasada (`detail.results`) hoy solo muestra `name — address`; se actualiza para mostrar también teléfono (si existe) y el mismo indicador de sitio web/enlace que en la búsqueda — así el historial queda consistente con lo que se ve en una búsqueda nueva.

## 3. Auditoría + propuesta para negocios con sitio existente

**`IWebsiteFetcherService`** (nuevo, `backend/LocaleBoost.Api/Services/WebsiteFetcherService.cs` + interfaz):

```csharp
public interface IWebsiteFetcherService
{
    Task<string> FetchHtmlAsync(string url, CancellationToken cancellationToken = default);
}
```

- `HttpClient` tipado (registrado como `AddHttpClient<IWebsiteFetcherService, WebsiteFetcherService>` con `Timeout = TimeSpan.FromSeconds(10)`).
- Si la respuesta no es exitosa (status >= 400), timeout, o error de conexión: lanza `ExternalServiceException("No se pudo acceder al sitio web actual, intentá de nuevo.")` — mismo patrón que `GoogleMapsService`/`ClaudeService`, así el `ExceptionHandlingMiddleware` ya existente lo convierte en 502 sin código nuevo.
- El HTML devuelto se trunca a 50 000 caracteres (`content[..50_000]` si es más largo) antes de devolverlo — evita mandarle a Claude un documento desproporcionado; 50 000 caracteres cubre el `<head>` y buena parte del `<body>` de la enorme mayoría de sitios de negocios locales.

**`IClaudeService`** (`backend/LocaleBoost.Api/Services/ClaudeService.cs`):

- Se agrega:

```csharp
public record WebsiteAuditResult(string AuditSummary, string ProposedHtml);

Task<WebsiteAuditResult> AuditAndProposeWebsiteAsync(
    string businessName, string address, string? phone, string existingSiteHtml,
    CancellationToken cancellationToken = default);
```

- Prompt (una sola llamada a Claude, en castellano, pidiendo JSON estricto):

```
Sos un consultor de marketing digital. Te paso el HTML actual del sitio web de un negocio local y sus datos. Necesito dos cosas, en castellano:

1. Una auditoría breve (4-8 puntos) de lo que se podría mejorar: SEO (títulos, meta descripción, encabezados, contenido), diseño/usabilidad, adaptación a celular, y velocidad/estructura del código si es evidente del HTML.
2. Una propuesta de sitio HTML mejorado, autocontenido en un solo archivo, que corrija esos puntos.

Negocio: {businessName}. Dirección: {address}. Teléfono: {phone ?? "no disponible"}.

HTML actual del sitio:
{existingSiteHtml (truncado)}

Respondé ÚNICAMENTE con un JSON válido de esta forma, sin texto antes ni después:
{"audit": "<auditoría en texto plano, con saltos de línea entre puntos>", "html": "<HTML completo de la propuesta>"}
```

- `MaxTokens` para esta llamada: 16000 (más alto que los 8192 de la generación simple, porque la respuesta incluye tanto la auditoría como el HTML completo).
- Parseo de la respuesta: `System.Text.Json.JsonSerializer.Deserialize<...>` sobre el texto devuelto por Claude. Si el parseo falla (Claude no devolvió JSON válido, caso raro pero posible), se trata igual que una falla del servicio externo: `ExternalServiceException("No se pudo generar la auditoría, intentá de nuevo.")`.

**`WebsitesController.Generate`** (`backend/LocaleBoost.Api/Controllers/WebsitesController.cs`):

- Después de buscar `result` (sin cambios), branch:
  - Si `!string.IsNullOrWhiteSpace(result.WebsiteUrl)`: `var html = await _websiteFetcher.FetchHtmlAsync(result.WebsiteUrl); var audit = await _claude.AuditAndProposeWebsiteAsync(result.Name, result.Address, result.Phone, html);` → `GeneratedContent = audit.ProposedHtml`, `AuditSummary = audit.AuditSummary`, `SourceWebsiteUrl = result.WebsiteUrl`.
  - Si no: como hoy, `GenerateWebsiteHtmlAsync(...)` → `GeneratedContent = html`, `AuditSummary = null`, `SourceWebsiteUrl = null`.
- Constructor gana `IWebsiteFetcherService`.

**Data model** — `GeneratedWebsite` (`backend/LocaleBoost.Api/Data/Entities/GeneratedWebsite.cs`): nuevas propiedades `public string? AuditSummary { get; set; }` y `public string? SourceWebsiteUrl { get; set; }`. Misma migración EF Core que agrega `BusinessSearchResult.WebsiteUrl` (una sola migración para ambos cambios, ya que se hacen en el mismo plan).

**DTOs** (`backend/LocaleBoost.Api/Dtos/Websites/GenerateWebsiteRequest.cs`): `GeneratedWebsiteDto` gana `string? AuditSummary` y `string? SourceWebsiteUrl`. `GenerateWebsiteRequest` no cambia — sigue siendo solo `BusinessSearchResultId`, el backend decide el flujo.

**Frontend:**

- `core/models/website.models.ts`: `GeneratedWebsite` gana `auditSummary: string | null` y `sourceWebsiteUrl: string | null`.
- `business-search.html`: el botón de generar muestra "Auditar y mejorar" cuando `result.hasWebsite` es verdadero, "Generar sitio web" cuando es falso — mismo `(click)="onGenerate(result)"`, mismo endpoint por debajo; el texto "Generando…"/"Auditando…" durante la carga sigue el mismo criterio.
- `generated-websites.html`: cuando `website.auditSummary` no es null, se muestra un bloque con el informe de auditoría (texto con saltos de línea preservados, `white-space: pre-line`) y la nota "Basado en: {{ website.sourceWebsiteUrl }}" antes del botón de vista previa del HTML propuesto.

## Error handling

Sigue el patrón ya establecido: fallas de servicios externos (Google Maps, Claude, y ahora el fetch del sitio existente) se capturan dentro de su servicio y se relanzan como `ExternalServiceException` con mensaje en castellano — el `ExceptionHandlingMiddleware` existente las convierte en 502 sin cambios. Validación de entrada (query vacío, etc.) sigue devolviendo 400 con mensaje en castellano. No se agregan casos nuevos de manejo de errores fuera de este patrón.

## Testing strategy

**Backend:**
- `GoogleMapsServiceTests`: casos existentes ajustados a la nueva firma/record; nuevo caso que confirma que con `includeWithWebsite: true` no se filtran los resultados con `websiteUri`, y que `WebsiteUrl` se captura correctamente en ambos modos.
- Nuevo `WebsiteFetcherServiceTests` (unitario, `HttpClient` con `HttpMessageHandler` fake, mismo patrón que `GoogleMapsServiceTests`/`ClaudeServiceTests`): fetch exitoso, truncamiento cuando el HTML supera el límite, y que timeout/status de error lanzan `ExternalServiceException`.
- `ClaudeServiceTests`: nuevo caso para `AuditAndProposeWebsiteAsync` — respuesta JSON válida se parsea en `AuditSummary`/`ProposedHtml`; respuesta no-JSON lanza `ExternalServiceException`.
- `BusinessesControllerTests`: caso nuevo para `includeWithWebsite=true` devolviendo resultados con sitio.
- `WebsitesControllerTests`: caso nuevo para un `BusinessSearchResult` con `WebsiteUrl` — confirma que se llama al fetcher + al método de auditoría (no al de generación simple) y que el DTO devuelto trae `AuditSummary`/`SourceWebsiteUrl`; caso existente sin sitio sigue igual.
- Migración EF Core: se verifica igual que las anteriores, dejando que `CustomWebApplicationFactory` la aplique en los tests de integración.

**Frontend:** tests unitarios existentes de `BusinessSearchService`/`business-search.ts` y `GeneratedWebsitesService`/`generated-websites.ts` se actualizan para las nuevas propiedades/parámetros; no se agrega e2e (fuera de alcance del proyecto en general, ya documentado en el spec original).

## Out of scope (diferido)

- Selector de idioma / soporte multi-idioma.
- Herramientas externas de análisis SEO (Lighthouse, PageSpeed Insights, etc.) — la auditoría depende solo de lo que Claude infiere del HTML.
- Auditar más de una página del sitio existente.
- Cualquier flujo para "publicar"/reemplazar el sitio real del negocio con la propuesta generada.
