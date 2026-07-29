import { HttpErrorResponse } from '@angular/common/http';

export function extractErrorMessage(error: HttpErrorResponse): string {
  const body: unknown = error.error;

  if (body && typeof body === 'object') {
    const { message, title } = body as { message?: unknown; title?: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (typeof title === 'string') {
      return title;
    }
  }

  return 'Ocurrió un error inesperado. Intentá de nuevo.';
}
