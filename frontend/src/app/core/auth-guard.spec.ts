import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let authServiceStub: { isAuthenticated: ReturnType<typeof vi.fn> };
  let routerStub: { createUrlTree: ReturnType<typeof vi.fn> };
  let fakeUrlTree: UrlTree;

  beforeEach(() => {
    fakeUrlTree = {} as UrlTree;
    authServiceStub = { isAuthenticated: vi.fn() };
    routerStub = { createUrlTree: vi.fn().mockReturnValue(fakeUrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });
  });

  it('allows navigation when the user is authenticated', () => {
    authServiceStub.isAuthenticated.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
  });

  it('redirects to /login when the user is not authenticated', () => {
    authServiceStub.isAuthenticated.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );

    expect(result).toBe(fakeUrlTree);
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
