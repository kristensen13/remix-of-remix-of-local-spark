import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts unauthenticated when no token is stored', () => {
    expect(service.isAuthenticated()).toBe(false);
  });

  it('login stores the token and flips isAuthenticated to true', async () => {
    const loginPromise = service.login({ email: 'a@b.com', password: 'secret123' });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'jwt-token-abc' });

    await loginPromise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token-abc');
    expect(localStorage.getItem('localeboost_token')).toBe('jwt-token-abc');
  });

  it('register stores the token and flips isAuthenticated to true', async () => {
    const registerPromise = service.register({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });

    const req = httpMock.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'jwt-token-xyz' });

    await registerPromise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token-xyz');
  });

  it('logout clears the token and navigates to /login', async () => {
    const loginPromise = service.login({ email: 'a@b.com', password: 'secret123' });
    httpMock.expectOne('/api/auth/login').flush({ token: 'jwt-token-abc' });
    await loginPromise;

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('localeboost_token')).toBeNull();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
