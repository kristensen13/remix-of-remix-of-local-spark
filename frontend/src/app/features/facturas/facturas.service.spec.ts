import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturasService } from './facturas.service';
import {
  CreateFacturaRequest,
  EstadoFactura,
  Factura,
  FacturaSummary,
  MarcarCobradaRequest,
  RectificarFacturaRequest,
} from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const summary1: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 121,
};

const factura1: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaVencimiento: null,
  fechaCobro: null,
  porcentajeRetencionIrpf: null,
  baseImponible: 100,
  totalIva: 21,
  totalRetencion: 0,
  total: 121,
  presupuestoOrigenId: null,
  facturaRectificadaId: null,
  pdfUrl: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
};

const createRequest: CreateFacturaRequest = {
  clienteId: 'c1',
  serieId: 's1',
  fechaVencimiento: null,
  porcentajeRetencionIrpf: null,
  lineas: [
    {
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Consultoría',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
};

describe('FacturasService', () => {
  let service: FacturasService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FacturasService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FacturasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads facturas on load() without a cliente filter', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.facturas()).toEqual([summary1]);
    expect(service.errorMessage()).toBeNull();
  });

  it('loads facturas filtered by clienteId when given', async () => {
    const loadPromise = service.load('c1');
    const req = httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.facturas()).toEqual([summary1]);
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request and reloads with the currently active cliente filter', async () => {
    const initialLoad = service.load('c1');
    httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET').flush([]);
    await initialLoad;

    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas?clienteId=c1' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await createPromise;
    expect(result).toEqual(factura1);
  });

  it('create() rejects and does not reload on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'POST');
    postReq.flush({ message: 'El cliente indicado no existe.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.method === 'GET')).toHaveLength(0);
  });

  it('getById() gets the factura by id without touching the list signals', async () => {
    const getPromise = service.getById('f1');
    const req = httpMock.expectOne((r) => r.url === '/api/facturas/f1' && r.method === 'GET');
    req.flush(factura1);

    const result = await getPromise;
    expect(result).toEqual(factura1);
    expect(service.facturas()).toEqual([]);
  });

  it('marcarCobrada() posts the fecha, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const request: MarcarCobradaRequest = { fechaCobro: '2026-08-15T00:00:00Z' };
    const marcarPromise = service.marcarCobrada('f1', request);

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST');
    expect(postReq.request.body).toEqual(request);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    await marcarPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('marcarCobrada() sets errorMessage and does not throw on failure', async () => {
    const marcarPromise = service.marcarCobrada('f1', { fechaCobro: '2026-08-15T00:00:00Z' });
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/marcar-cobrada' && r.method === 'POST');
    postReq.flush(
      { message: 'Solo se pueden marcar como cobradas facturas en estado Emitida.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(marcarPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    expect(httpMock.match((r) => r.method === 'GET')).toHaveLength(0);
  });

  it('anular() posts an empty body, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const anularPromise = service.anular('f1');

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/anular' && r.method === 'POST');
    expect(postReq.request.body).toEqual({});
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    await anularPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('anular() sets errorMessage and does not throw on failure', async () => {
    const anularPromise = service.anular('f1');
    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/anular' && r.method === 'POST');
    postReq.flush({ message: 'La factura ya está anulada.' }, { status: 409, statusText: 'Conflict' });

    await expect(anularPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('La factura ya está anulada.');
  });

  it('rectificar() posts the request, reloads the list, and resolves with the rectificativa', async () => {
    const rectificarRequest: RectificarFacturaRequest = {
      serieRectificativaId: 's2',
      motivo: 'Error en el importe',
      lineasCorregidas: createRequest.lineas,
    };
    const rectificarPromise = service.rectificar('f1', rectificarRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/facturas/f1/rectificar' && r.method === 'POST');
    expect(postReq.request.body).toEqual(rectificarRequest);
    postReq.flush(factura1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/facturas' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await rectificarPromise;
    expect(result).toEqual(factura1);
  });
});
