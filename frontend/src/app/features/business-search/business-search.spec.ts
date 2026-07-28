import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BusinessSearch } from './business-search';
import { BusinessSearchService } from './business-search.service';
import { GeneratedWebsitesService } from '../generated-websites/generated-websites.service';
import { BusinessSearchResult } from '../../core/models/business.models';

describe('BusinessSearch', () => {
  let component: BusinessSearch;
  let websitesServiceStub: { generate: ReturnType<typeof vi.fn> };
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

    websitesServiceStub = { generate: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        { provide: BusinessSearchService, useValue: searchServiceStub },
        { provide: GeneratedWebsitesService, useValue: websitesServiceStub },
      ],
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

  it('calls GeneratedWebsitesService.generate with the result id', () => {
    component.onGenerate({ id: 'r1', placeId: 'p1', name: 'Acme', address: '1 Main St', phone: null });
    expect(websitesServiceStub.generate).toHaveBeenCalledWith('r1');
  });

  it('tracks which result is currently generating', async () => {
    let resolveGenerate!: () => void;
    websitesServiceStub.generate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    const result = { id: 'r1', placeId: 'p1', name: 'Acme', address: '1 Main St', phone: null };

    const generatePromise = component.onGenerate(result);
    expect(component.generatingResultId()).toBe('r1');

    resolveGenerate();
    await generatePromise;

    expect(component.generatingResultId()).toBeNull();
  });
});
