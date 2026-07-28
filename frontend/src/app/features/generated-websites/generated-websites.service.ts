import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeneratedWebsite } from '../../core/models/website.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class GeneratedWebsitesService {
  private readonly http = inject(HttpClient);

  readonly websites = signal<GeneratedWebsite[]>([]);
  readonly isLoading = signal(false);
  readonly isGenerating = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async loadWebsites(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const websites = await firstValueFrom(this.http.get<GeneratedWebsite[]>('/api/websites'));
      this.websites.set(websites);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async generate(businessSearchResultId: string): Promise<void> {
    this.isGenerating.set(true);
    this.errorMessage.set(null);
    try {
      const website = await firstValueFrom(
        this.http.post<GeneratedWebsite>('/api/websites/generate', { businessSearchResultId }),
      );
      this.websites.update((current) => [website, ...current]);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
      throw error;
    } finally {
      this.isGenerating.set(false);
    }
  }
}
