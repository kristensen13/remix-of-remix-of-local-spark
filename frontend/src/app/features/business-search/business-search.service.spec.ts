import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessSearchService } from './business-search.service';

describe('BusinessSearchService', () => {
  let service: BusinessSearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BusinessSearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('populates results on a successful search', async () => {
    const searchPromise = service.search('plumbers', 'Madrid', false);

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/businesses/search' &&
        r.params.get('query') === 'plumbers' &&
        r.params.get('location') === 'Madrid',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      searchId: 's1',
      results: [
        { id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null, hasWebsite: false, websiteUrl: null },
      ],
    });

    await searchPromise;

    expect(service.results()).toEqual([
      { id: 'r1', placeId: 'p1', name: 'Acme Plumbing', address: '1 Main St', phone: null, hasWebsite: false, websiteUrl: null },
    ]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('omits the location param when none is given', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.has('location')).toBe(false);
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('omits the includeWithWebsite param when false', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.has('includeWithWebsite')).toBe(false);
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('includes includeWithWebsite=true when true', async () => {
    const searchPromise = service.search('plumbers', null, true);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    expect(req.request.params.get('includeWithWebsite')).toBe('true');
    req.flush({ searchId: 's1', results: [] });

    await searchPromise;
  });

  it('sets errorMessage and clears results on failure', async () => {
    const searchPromise = service.search('plumbers', null, false);

    const req = httpMock.expectOne((r) => r.url === '/api/businesses/search');
    req.flush({ message: 'El término de búsqueda es obligatorio.' }, { status: 400, statusText: 'Bad Request' });

    await searchPromise;

    expect(service.errorMessage()).toBe('El término de búsqueda es obligatorio.');
    expect(service.results()).toEqual([]);
  });
});
