import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SearchHistory } from './search-history';
import { SearchHistoryService } from './search-history.service';
import { BusinessSearchDetail, BusinessSearchSummary } from '../../core/models/business.models';

describe('SearchHistory', () => {
  let component: SearchHistory;
  let historyServiceStub: {
    searches: ReturnType<typeof signal<BusinessSearchSummary[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    loadSearches: ReturnType<typeof vi.fn>;
    getSearchDetail: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    historyServiceStub = {
      searches: signal<BusinessSearchSummary[]>([]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      loadSearches: vi.fn().mockResolvedValue(undefined),
      getSearchDetail: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SearchHistoryService, useValue: historyServiceStub }],
    });

    component = TestBed.createComponent(SearchHistory).componentInstance;
  });

  it('loads the search history on init', () => {
    component.ngOnInit();
    expect(historyServiceStub.loadSearches).toHaveBeenCalled();
  });

  it('viewDetail sets selectedDetail on success', async () => {
    const detail: BusinessSearchDetail = {
      id: 's1',
      query: 'plumbers',
      location: null,
      createdAt: '2026-01-01T00:00:00Z',
      results: [],
    };
    historyServiceStub.getSearchDetail.mockResolvedValue(detail);

    await component.viewDetail('s1');

    expect(component.selectedDetail()).toEqual(detail);
    expect(component.detailError()).toBeNull();
  });

  it('viewDetail sets detailError on failure', async () => {
    historyServiceStub.getSearchDetail.mockRejectedValue(new Error('network error'));

    await component.viewDetail('s1');

    expect(component.detailError()).toBe('Could not load this search.');
    expect(component.selectedDetail()).toBeNull();
  });
});
