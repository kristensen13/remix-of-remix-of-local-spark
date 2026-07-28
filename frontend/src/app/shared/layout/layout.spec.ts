import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Layout } from './layout';
import { AuthService } from '../../core/auth.service';

describe('Layout', () => {
  let component: Layout;
  let authServiceStub: { logout: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { logout: vi.fn() };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
    });

    component = TestBed.createComponent(Layout).componentInstance;
  });

  it('logout() delegates to AuthService.logout()', () => {
    component.logout();
    expect(authServiceStub.logout).toHaveBeenCalled();
  });
});
