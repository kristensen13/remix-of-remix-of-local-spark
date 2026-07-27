import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage } from './http-error.util';

describe('extractErrorMessage', () => {
  it('returns the backend "message" field when present', () => {
    const error = new HttpErrorResponse({
      error: { message: 'Invalid or already used invite code.' },
      status: 400,
    });

    expect(extractErrorMessage(error)).toBe('Invalid or already used invite code.');
  });

  it('falls back to the ProblemDetails "title" field when there is no "message"', () => {
    const error = new HttpErrorResponse({
      error: { title: "Couldn't complete the search, try again.", status: 502 },
      status: 502,
    });

    expect(extractErrorMessage(error)).toBe("Couldn't complete the search, try again.");
  });

  it('returns a generic message when the error body has neither field', () => {
    const error = new HttpErrorResponse({ error: null, status: 500 });

    expect(extractErrorMessage(error)).toBe('An unexpected error occurred. Please try again.');
  });
});
