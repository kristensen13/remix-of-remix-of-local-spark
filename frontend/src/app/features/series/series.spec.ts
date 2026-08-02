// frontend/src/app/features/series/series.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Series } from './series';
import { SeriesService } from './series.service';
import { SerieFormModal } from './serie-form-modal';
import { Serie } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2026,
  esRectificativa: false,
};

const serie2: Serie = {
  id: 's2',
  codigo: 'R',
  descripcion: null,
  ultimoNumero: 0,
  anio: 2026,
  esRectificativa: true,
};

describe('Series', () => {
  let component: Series;
  let seriesServiceStub: {
    series: ReturnType<typeof signal<Serie[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
  };
  let modalStub: { openForCreate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    seriesServiceStub = {
      series: signal<Serie[]>([serie1, serie2]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
    };
    modalStub = { openForCreate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: SeriesService, useValue: seriesServiceStub }],
    });

    component = TestBed.createComponent(Series).componentInstance;
    component.modal = modalStub as unknown as SerieFormModal;
  });

  it('ngOnInit() loads series', () => {
    component.ngOnInit();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('onNew() opens the modal', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  describe('template rendering', () => {
    it('renders one table row per serie', () => {
      const localStub = {
        series: signal<Serie[]>([serie1, serie2]),
        isLoading: signal(false),
        errorMessage: signal<string | null>(null),
        load: vi.fn().mockResolvedValue(undefined),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: SeriesService, useValue: localStub }],
      });

      const fixture = TestBed.createComponent(Series);
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('A');
      expect(text).toContain('Serie general');
      expect(text).toContain('R');
    });

    it('shows the empty-state message when there are no series', () => {
      const localStub = {
        series: signal<Serie[]>([]),
        isLoading: signal(false),
        errorMessage: signal<string | null>(null),
        load: vi.fn().mockResolvedValue(undefined),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: SeriesService, useValue: localStub }],
      });

      const fixture = TestBed.createComponent(Series);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay series — creá la primera con "Nueva serie".');
    });
  });
});
