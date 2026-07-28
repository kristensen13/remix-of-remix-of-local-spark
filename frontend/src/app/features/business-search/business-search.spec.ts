import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BusinessSearch } from './business-search';
import { BusinessSearchService } from './business-search.service';
import { BusinessSearchResult } from '../../core/models/business.models';

describe('BusinessSearch', () => {
  let component: BusinessSearch;
  let searchServiceStub: {
    results: ReturnType<typeof signal<BusinessSearchResult[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    search: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    searchServiceStub = {
      results: signal<BusinessSearchResult[]>([]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      search: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: BusinessSearchService, useValue: searchServiceStub }],
    });

    component = TestBed.createComponent(BusinessSearch).componentInstance;
  });

  it('does not call search when the query is blank', () => {
    component.query.set('   ');
    component.onSubmit();
    expect(searchServiceStub.search).not.toHaveBeenCalled();
  });

  it('calls search with a trimmed query and null location when location is blank', () => {
    component.query.set('  plumbers  ');
    component.location.set('   ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', null);
  });

  it('calls search with the trimmed location when one is given', () => {
    component.query.set('plumbers');
    component.location.set(' Madrid ');
    component.onSubmit();
    expect(searchServiceStub.search).toHaveBeenCalledWith('plumbers', 'Madrid');
  });
});
