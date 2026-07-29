import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage } from './http-error.util';

describe('extractErrorMessage', () => {
  it('returns the backend "message" field when present', () => {
    const error = new HttpErrorResponse({
      error: { message: 'El código de invitación no es válido o ya fue usado.' },
      status: 400,
    });

    expect(extractErrorMessage(error)).toBe('El código de invitación no es válido o ya fue usado.');
  });

  it('falls back to the ProblemDetails "title" field when there is no "message"', () => {
    const error = new HttpErrorResponse({
      error: { title: "No se pudo completar la búsqueda, intentá de nuevo.", status: 502 },
      status: 502,
    });

    expect(extractErrorMessage(error)).toBe("No se pudo completar la búsqueda, intentá de nuevo.");
  });

  it('returns a generic message when the error body has neither field', () => {
    const error = new HttpErrorResponse({ error: null, status: 500 });

    expect(extractErrorMessage(error)).toBe('Ocurrió un error inesperado. Intentá de nuevo.');
  });
});
