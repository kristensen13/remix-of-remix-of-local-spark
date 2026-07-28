import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BusinessSearchDetail, BusinessSearchSummary } from '../../core/models/business.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class SearchHistoryService {
  private readonly http = inject(HttpClient);

  readonly searches = signal<BusinessSearchSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async loadSearches(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const searches = await firstValueFrom(
        this.http.get<BusinessSearchSummary[]>('/api/businesses/searches'),
      );
      this.searches.set(searches);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  getSearchDetail(id: string): Promise<BusinessSearchDetail> {
    return firstValueFrom(this.http.get<BusinessSearchDetail>(`/api/businesses/searches/${id}`));
  }
}
