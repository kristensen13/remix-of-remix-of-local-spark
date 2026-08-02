import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SeriesService } from './series.service';
import { Serie, CreateSerieRequest } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2026,
  esRectificativa: false,
};

const createRequest: CreateSerieRequest = {
  codigo: 'A',
  descripcion: 'Serie general',
  anio: 2026,
  esRectificativa: false,
};

describe('SeriesService', () => {
  let service: SeriesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SeriesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SeriesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads series on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    req.flush([serie1]);
    await loadPromise;

    expect(service.series()).toEqual([serie1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created serie', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(serie1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'GET');
    getReq.flush([serie1]);

    const result = await createPromise;
    expect(result).toEqual(serie1);
    expect(service.series()).toEqual([serie1]);
  });

  it('create() rejects with a 400 and does not reload the list on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    postReq.flush({ message: 'El código de serie es obligatorio.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/series' && r.method === 'GET')).toHaveLength(0);
  });

  it('create() rejects with a 409 on duplicate código+año and does not reload the list', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/series' && r.method === 'POST');
    postReq.flush(
      { message: 'Ya existe una serie con ese código para ese año.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/series' && r.method === 'GET')).toHaveLength(0);
  });
});
