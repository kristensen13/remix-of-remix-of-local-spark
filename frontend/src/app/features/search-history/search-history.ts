import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SearchHistoryService } from './search-history.service';
import { BusinessSearchDetail } from '../../core/models/business.models';

@Component({
  selector: 'app-search-history',
  imports: [DatePipe],
  templateUrl: './search-history.html',
  styleUrl: './search-history.css',
})
export class SearchHistory implements OnInit {
  private readonly historyService = inject(SearchHistoryService);

  readonly searches = this.historyService.searches;
  readonly isLoading = this.historyService.isLoading;
  readonly errorMessage = this.historyService.errorMessage;

  readonly selectedDetail = signal<BusinessSearchDetail | null>(null);
  readonly detailError = signal<string | null>(null);

  ngOnInit(): void {
    void this.historyService.loadSearches();
  }

  async viewDetail(id: string): Promise<void> {
    this.detailError.set(null);
    try {
      const detail = await this.historyService.getSearchDetail(id);
      this.selectedDetail.set(detail);
    } catch {
      this.detailError.set('Could not load this search.');
      this.selectedDetail.set(null);
    }
  }
}
