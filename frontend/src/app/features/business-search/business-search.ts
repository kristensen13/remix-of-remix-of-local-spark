import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessSearchService } from './business-search.service';
import { GeneratedWebsitesService } from '../generated-websites/generated-websites.service';
import { BusinessSearchResult } from '../../core/models/business.models';

@Component({
  selector: 'app-business-search',
  imports: [FormsModule],
  templateUrl: './business-search.html',
  styleUrl: './business-search.css',
})
export class BusinessSearch {
  protected readonly searchService = inject(BusinessSearchService);
  private readonly websitesService = inject(GeneratedWebsitesService);

  readonly query = signal('');
  readonly location = signal('');

  readonly results = this.searchService.results;
  readonly isLoading = this.searchService.isLoading;
  readonly errorMessage = this.searchService.errorMessage;

  readonly generatingResultId = signal<string | null>(null);
  readonly generateError = this.websitesService.errorMessage;

  onSubmit(): void {
    const trimmedQuery = this.query().trim();
    if (!trimmedQuery) {
      return;
    }
    const trimmedLocation = this.location().trim();
    void this.searchService.search(trimmedQuery, trimmedLocation || null);
  }

  async onGenerate(result: BusinessSearchResult): Promise<void> {
    this.generatingResultId.set(result.id);
    try {
      await this.websitesService.generate(result.id);
    } catch {
      // errorMessage is already set on the service; nothing further to do here.
    } finally {
      this.generatingResultId.set(null);
    }
  }
}
