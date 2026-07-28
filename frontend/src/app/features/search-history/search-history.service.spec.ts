import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchHistoryService } from './search-history.service';

describe('SearchHistoryService', () => {
  let service: SearchHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and stores the list of past searches', async () => {
    const loadPromise = service.loadSearches();

    const req = httpMock.expectOne('/api/businesses/searches');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 's1', query: 'plumbers', location: 'Madrid', createdAt: '2026-01-01T00:00:00Z', resultCount: 3 },
    ]);

    await loadPromise;

    expect(service.searches().length).toBe(1);
    expect(service.searches()[0].query).toBe('plumbers');
    expect(service.isLoading()).toBe(false);
  });

  it('sets errorMessage on a failed load', async () => {
    const loadPromise = service.loadSearches();

    const req = httpMock.expectOne('/api/businesses/searches');
    req.flush({ title: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

    await loadPromise;

    expect(service.errorMessage()).toBe('Server error');
  });

  it('fetches a single search detail by id', async () => {
    const detailPromise = service.getSearchDetail('s1');

    const req = httpMock.expectOne('/api/businesses/searches/s1');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 's1',
      query: 'plumbers',
      location: 'Madrid',
      createdAt: '2026-01-01T00:00:00Z',
      results: [],
    });

    const detail = await detailPromise;

    expect(detail.id).toBe('s1');
    expect(detail.results).toEqual([]);
  });
});
