import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { extractErrorMessage } from '../../core/http-error.util';

type LoginMode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<LoginMode>('login');
  readonly errorMessage = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    inviteCode: ['', [Validators.required]],
  });

  setMode(mode: LoginMode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.login(this.loginForm.getRawValue());
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    if (this.registerForm.invalid) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.register(this.registerForm.getRawValue());
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
