import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceStub: { token: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { token: vi.fn(), logout: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token when one is present', () => {
    authServiceStub.token.mockReturnValue('jwt-token-abc');

    httpClient.get('/api/websites').subscribe();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-token-abc');
    req.flush([]);
  });

  it('does not attach an Authorization header when there is no token', () => {
    authServiceStub.token.mockReturnValue(null);

    httpClient.get('/api/websites').subscribe();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('calls AuthService.logout() on a 401 response', () => {
    authServiceStub.token.mockReturnValue('expired-token');
    let capturedError: HttpErrorResponse | undefined;

    httpClient.get('/api/websites').subscribe({
      error: (err: HttpErrorResponse) => {
        capturedError = err;
      },
    });

    const req = httpMock.expectOne('/api/websites');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceStub.logout).toHaveBeenCalled();
    expect(capturedError?.status).toBe(401);
  });

  it('does not call logout() on a non-401 error', () => {
    authServiceStub.token.mockReturnValue('valid-token');
    let capturedError: HttpErrorResponse | undefined;

    httpClient.get('/api/websites').subscribe({
      error: (err: HttpErrorResponse) => {
        capturedError = err;
      },
    });

    const req = httpMock.expectOne('/api/websites');
    req.flush({ title: 'Bad gateway' }, { status: 502, statusText: 'Bad Gateway' });

    expect(authServiceStub.logout).not.toHaveBeenCalled();
    expect(capturedError?.status).toBe(502);
  });
});
