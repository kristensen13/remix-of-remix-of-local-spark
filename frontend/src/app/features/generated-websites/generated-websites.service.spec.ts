import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GeneratedWebsitesService } from './generated-websites.service';

describe('GeneratedWebsitesService', () => {
  let service: GeneratedWebsitesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GeneratedWebsitesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and stores the list of generated websites', async () => {
    const loadPromise = service.loadWebsites();

    const req = httpMock.expectOne('/api/websites');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'w1',
        businessName: 'Acme Plumbing',
        businessAddress: '1 Main St',
        businessPhone: null,
        generatedContent: '<html></html>',
        auditSummary: null,
        sourceWebsiteUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    await loadPromise;

    expect(service.websites().length).toBe(1);
    expect(service.isLoading()).toBe(false);
  });

  it('generate() prepends the new website to the list', async () => {
    const generatePromise = service.generate('r1');

    const req = httpMock.expectOne('/api/websites/generate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ businessSearchResultId: 'r1' });
    req.flush({
      id: 'w2',
      businessName: 'New Biz',
      businessAddress: '2 Side St',
      businessPhone: null,
      generatedContent: '<html></html>',
      auditSummary: null,
      sourceWebsiteUrl: null,
      createdAt: '2026-01-02T00:00:00Z',
    });

    await generatePromise;

    expect(service.websites()[0].id).toBe('w2');
    expect(service.isGenerating()).toBe(false);
  });

  it('generate() sets errorMessage and rethrows on failure', async () => {
    const generatePromise = service.generate('r1');

    const req = httpMock.expectOne('/api/websites/generate');
    req.flush({ title: 'Bad gateway' }, { status: 502, statusText: 'Bad Gateway' });

    await expect(generatePromise).rejects.toBeTruthy();
    expect(service.errorMessage()).toBe('Bad gateway');
    expect(service.isGenerating()).toBe(false);
  });
});
