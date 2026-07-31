# Frontend Angular — módulo Clientes — cómo continuar

## Estado actual (verificado en esta sesión)

- **Backend**: módulo de facturación (Clientes, Series, Presupuestos, Facturas)
  ya está mergeado, migrado, testeado (43/43 tests) y pusheado a `origin/main`
  (commit `68caa1c`).
- **Frontend**: dependencias instaladas (`npm install` ya ejecutado) y
  `npm run build` verificado correcto. No hay ningún código nuevo todavía —
  solo se dejó listo el entorno para empezar.

## Cómo arrancar en dos terminales

```bash
# Terminal 1 — backend (puerto 5091, ver proxy.conf.json)
cd backend/LocaleBoost.Api
dotnet run

# Terminal 2 — frontend
cd frontend
npm start   # ng serve --proxy-config proxy.conf.json
```

## Contrato de la API de Clientes (ya implementado en el backend)

Base: `/api/clientes` (requiere JWT vía `Authorization: Bearer`, ya lo añade
`authInterceptor`).

| Método | Ruta                | Body                     | Respuesta         |
|--------|---------------------|--------------------------|--------------------|
| GET    | `/api/clientes`      | —                        | `ClienteDto[]`     |
| GET    | `/api/clientes/{id}` | —                        | `ClienteDto`       |
| POST   | `/api/clientes`      | `CreateClienteRequest`   | `ClienteDto` (201) |
| PUT    | `/api/clientes/{id}` | `UpdateClienteRequest`   | `ClienteDto`       |
| DELETE | `/api/clientes/{id}` | —                        | 204 / 409 si tiene facturas o presupuestos asociados |

```csharp
// backend/LocaleBoost.Api/Dtos/Clientes/ClienteDtos.cs
record ClienteDto(Guid Id, string Nombre, string Nif, string Direccion,
    string? CodigoPostal, string? Ciudad, string? Provincia, string Pais,
    string? Email, string? Telefono, bool EsAutonomoOProfesional, DateTime CreatedAt);

record CreateClienteRequest(string Nombre, string Nif, string Direccion,
    string? CodigoPostal, string? Ciudad, string? Provincia, string? Pais,
    string? Email, string? Telefono, bool EsAutonomoOProfesional);

record UpdateClienteRequest(/* mismos campos que CreateClienteRequest */);
```

Notas de validación del backend a respetar en el formulario:
- `Nombre` y `Nif` son obligatorios (400 si vienen vacíos).
- `Pais` por defecto es `"España"` si se manda vacío/null.
- Borrar un cliente con facturas o presupuestos asociados devuelve **409
  Conflict** con `{ message: "..." }` — el frontend debe mostrar ese mensaje,
  no un error genérico.

## Convenciones del proyecto a seguir (ya usadas en `search-history`,
## `business-search`, `generated-websites`)

- **Standalone components**, sin NgModules. `imports: [...]` en el decorator.
- Los servicios usan `@Service()` de `@angular/core` (no `@Injectable()` — es
  la convención ya establecida en este repo/versión de Angular, ver
  `core/auth.service.ts` y `features/*/*.service.ts`).
- **Estado con signals**: `signal<T>()`, `.set()`, `.update()`, expuestos como
  `readonly` en el servicio y consumidos directo en la plantilla (`results()`,
  `isLoading()`, `errorMessage()`).
- **Control flow nativo** en templates: `@if`, `@else if`, `@for (... ;
  track ...)`. Nada de `*ngIf`/`*ngFor`.
- **Formularios**: `FormsModule` + `[ngModel]`/`(ngModelChange)` atado a
  signals (patrón template-driven, no Reactive Forms) — ver
  `business-search.ts`/`.html`.
- **Manejo de errores HTTP**: `extractErrorMessage(error as HttpErrorResponse)`
  de `core/http-error.util.ts`, guardado en un signal `errorMessage`.
- **Llamadas HTTP**: `firstValueFrom(this.http.get/post/put/delete(...))`
  dentro de métodos `async`, con try/catch/finally que gestiona
  `isLoading`/`errorMessage`.
- **Modales**: overlay `fixed inset-0 bg-black/50` + panel `rounded bg-white`,
  ver `generated-websites.html` (`previewing()` como signal que controla el
  modal).
- **Estilos**: Tailwind utility classes directo en el HTML, sin CSS custom
  salvo lo mínimo en el `.css` del componente.
- **Rutas**: se registran en `app.routes.ts` como hijas de `Layout` (que ya
  aplica `authGuard`), y el link de navegación se añade en
  `shared/layout/layout.html`.
- **Tests**: Vitest + `TestBed`, servicio stubbeado con signals + `vi.fn()`
  (ver `generated-websites.spec.ts`). Cada componente y servicio nuevo debería
  llevar su `.spec.ts` siguiendo ese mismo patrón.

## Plan de archivos a crear

```
src/app/core/models/cliente.models.ts        # ClienteDto, CreateClienteRequest, UpdateClienteRequest (mismos campos que el backend)
src/app/features/clientes/clientes.service.ts       # + clientes.service.spec.ts
src/app/features/clientes/clientes.ts               # componente de listado + alta/edición
src/app/features/clientes/clientes.html
src/app/features/clientes/clientes.css
src/app/features/clientes/clientes.spec.ts
```

Cambios en archivos existentes:
- `app.routes.ts`: añadir `{ path: 'clientes', component: Clientes }` dentro de
  los hijos de `Layout`.
- `shared/layout/layout.html`: añadir el link de navegación "Clientes".

### Sugerencia de UX para el componente (a validar contigo, no bloqueante)

Dado que es un CRUD completo (a diferencia de las features de solo lectura
existentes), lo más simple y consistente con el resto del repo:
- Listado en tabla/lista con botones **Editar** / **Eliminar** por fila.
- Un único formulario (creación y edición comparten la misma plantilla)
  mostrado inline arriba del listado o en el modal ya usado en
  `generated-websites` — a decidir en la próxima sesión.
- Confirmar el `DELETE` con un `confirm()` simple (no hay patrón de diálogo de
  confirmación custom todavía en el repo).

## Pendiente general del proyecto (sin cambios desde la sesión anterior)

- PDF de facturas/presupuestos: librería aún por elegir (QuestPDF, iText…).
- Pantallas de Presupuestos y Facturas en el frontend: tampoco existen todavía
  — Clientes es el primer feature de facturación en el frontend, y las otras
  tres (Series, Presupuestos, Facturas) seguirán el mismo patrón una vez esté
  este resuelto.
- Endpoint de anulación de facturas: pendiente de confirmar con asesor fiscal
  si debe ser rectificativa en vez de simple cambio de estado, antes de
  exponerlo en el frontend.
