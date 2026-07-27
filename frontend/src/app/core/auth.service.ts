import { Service, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from './models/auth.models';

const TOKEN_STORAGE_KEY = 'localeboost_token';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  token(): string | null {
    return this.tokenSignal();
  }

  async login(request: LoginRequest): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>('/api/auth/login', request));
    this.setToken(response.token);
  }

  async register(request: RegisterRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/register', request),
    );
    this.setToken(response.token);
  }

  logout(): void {
    this.tokenSignal.set(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    this.router.navigateByUrl('/login');
  }

  private setToken(token: string): void {
    this.tokenSignal.set(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}
