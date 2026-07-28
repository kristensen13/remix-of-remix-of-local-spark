import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessSearchService } from './business-search.service';

@Component({
  selector: 'app-business-search',
  imports: [FormsModule],
  templateUrl: './business-search.html',
  styleUrl: './business-search.css',
})
export class BusinessSearch {
  protected readonly searchService = inject(BusinessSearchService);

  readonly query = signal('');
  readonly location = signal('');

  readonly results = this.searchService.results;
  readonly isLoading = this.searchService.isLoading;
  readonly errorMessage = this.searchService.errorMessage;

  onSubmit(): void {
    const trimmedQuery = this.query().trim();
    if (!trimmedQuery) {
      return;
    }
    const trimmedLocation = this.location().trim();
    void this.searchService.search(trimmedQuery, trimmedLocation || null);
  }
}
