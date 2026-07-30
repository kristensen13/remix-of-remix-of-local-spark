import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BusinessSearchResponse, BusinessSearchResult } from '../../core/models/business.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class BusinessSearchService {
  private readonly http = inject(HttpClient);

  readonly results = signal<BusinessSearchResult[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async search(query: string, location: string | null, includeWithWebsite: boolean): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let params = new HttpParams().set('query', query);
    if (location) {
      params = params.set('location', location);
    }
    if (includeWithWebsite) {
      params = params.set('includeWithWebsite', 'true');
    }

    try {
      const response = await firstValueFrom(
        this.http.get<BusinessSearchResponse>('/api/businesses/search', { params }),
      );
      this.results.set(response.results);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
      this.results.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
