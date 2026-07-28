import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../core/auth.service';

describe('Login', () => {
  let component: Login;
  let authServiceStub: { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
  let routerStub: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceStub = { login: vi.fn(), register: vi.fn() };
    routerStub = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });

    component = TestBed.createComponent(Login).componentInstance;
  });

  it('starts in login mode with no error message', () => {
    expect(component.mode()).toBe('login');
    expect(component.errorMessage()).toBeNull();
  });

  it('switching mode clears any error message', () => {
    component.errorMessage.set('some previous error');
    component.setMode('register');
    expect(component.mode()).toBe('register');
    expect(component.errorMessage()).toBeNull();
  });

  it('does not call AuthService.login when the login form is invalid', async () => {
    await component.submitLogin();
    expect(authServiceStub.login).not.toHaveBeenCalled();
  });

  it('logs in and navigates to /search on success', async () => {
    authServiceStub.login.mockResolvedValue(undefined);
    component.loginForm.setValue({ email: 'a@b.com', password: 'secret123' });

    await component.submitLogin();

    expect(authServiceStub.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/search');
    expect(component.errorMessage()).toBeNull();
  });

  it('shows the backend error message when login fails', async () => {
    authServiceStub.login.mockRejectedValue({ error: { message: 'Invalid email or password.' } });
    component.loginForm.setValue({ email: 'a@b.com', password: 'wrongpass' });

    await component.submitLogin();

    expect(component.errorMessage()).toBe('Invalid email or password.');
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not call AuthService.register when the register form is invalid', async () => {
    await component.submitRegister();
    expect(authServiceStub.register).not.toHaveBeenCalled();
  });

  it('registers and navigates to /search on success', async () => {
    authServiceStub.register.mockResolvedValue(undefined);
    component.registerForm.setValue({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });

    await component.submitRegister();

    expect(authServiceStub.register).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'INV1',
    });
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/search');
  });

  it('shows the backend error message when registration fails', async () => {
    authServiceStub.register.mockRejectedValue({
      error: { message: 'Invalid or already used invite code.' },
    });
    component.registerForm.setValue({
      email: 'a@b.com',
      password: 'secret123',
      inviteCode: 'USED',
    });

    await component.submitRegister();

    expect(component.errorMessage()).toBe('Invalid or already used invite code.');
  });
});
