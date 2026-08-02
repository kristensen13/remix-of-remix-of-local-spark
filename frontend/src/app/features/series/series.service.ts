import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Serie, CreateSerieRequest } from '../../core/models/serie.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class SeriesService {
  private readonly http = inject(HttpClient);

  readonly series = signal<Serie[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const series = await firstValueFrom(this.http.get<Serie[]>('/api/series'));
      this.series.set(series);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreateSerieRequest): Promise<Serie> {
    const serie = await firstValueFrom(this.http.post<Serie>('/api/series', request));
    await this.load();
    return serie;
  }
}
