import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { GeneratedWebsites } from './generated-websites';
import { GeneratedWebsitesService } from './generated-websites.service';
import { GeneratedWebsite } from '../../core/models/website.models';

describe('GeneratedWebsites', () => {
  let component: GeneratedWebsites;
  let websitesServiceStub: {
    websites: ReturnType<typeof signal<GeneratedWebsite[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    isGenerating: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    loadWebsites: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
  };
  const sampleWebsite: GeneratedWebsite = {
    id: 'w1',
    businessName: 'Acme Plumbing',
    businessAddress: '1 Main St',
    businessPhone: null,
    generatedContent: '<html><body>Hi</body></html>',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    websitesServiceStub = {
      websites: signal<GeneratedWebsite[]>([sampleWebsite]),
      isLoading: signal(false),
      isGenerating: signal(false),
      errorMessage: signal<string | null>(null),
      loadWebsites: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: GeneratedWebsitesService, useValue: websitesServiceStub }],
    });

    component = TestBed.createComponent(GeneratedWebsites).componentInstance;
  });

  it('loads websites on init', () => {
    component.ngOnInit();
    expect(websitesServiceStub.loadWebsites).toHaveBeenCalled();
  });

  it('starts with no website being previewed', () => {
    expect(component.previewing()).toBeNull();
  });

  it('preview() sets the selected website', () => {
    component.preview(sampleWebsite);
    expect(component.previewing()).toEqual(sampleWebsite);
  });

  it('closePreview() clears the selected website', () => {
    component.preview(sampleWebsite);
    component.closePreview();
    expect(component.previewing()).toBeNull();
  });

  it('previewSrcdoc() is null when nothing is being previewed', () => {
    expect(component.previewSrcdoc()).toBeNull();
  });

  it('previewSrcdoc() is a non-null SafeHtml value once previewing a website', () => {
    component.preview(sampleWebsite);
    expect(component.previewSrcdoc()).not.toBeNull();
  });

  it('previewSrcdoc() resets to null after closePreview()', () => {
    component.preview(sampleWebsite);
    expect(component.previewSrcdoc()).not.toBeNull();
    component.closePreview();
    expect(component.previewSrcdoc()).toBeNull();
  });
});
