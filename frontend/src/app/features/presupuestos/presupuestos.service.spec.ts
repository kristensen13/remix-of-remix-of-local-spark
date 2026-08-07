import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PresupuestosService } from './presupuestos.service';
import {
  CreatePresupuestoRequest,
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  TipoIva,
  TipoLinea,
  UpdatePresupuestoRequest,
} from '../../core/models/presupuesto.models';
import { ConvertirAFacturaRequest, EstadoFactura, Factura } from '../../core/models/factura.models';

const summary1: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: null,
};

const presupuesto1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: '2026-09-01T00:00:00Z',
  notas: 'Nota de prueba',
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 10,
      precioUnitario: 50,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const createRequest: CreatePresupuestoRequest = {
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  fechaValidez: '2026-09-01',
  notas: 'Nota de prueba',
  lineas: [
    {
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 10,
      precioUnitario: 50,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
};

const updateRequest: UpdatePresupuestoRequest = {
  fechaValidez: '2026-09-01',
  notas: 'Nota de prueba',
  lineas: createRequest.lineas,
};

describe('PresupuestosService', () => {
  let service: PresupuestosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PresupuestosService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PresupuestosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads presupuestos on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    req.flush([summary1]);
    await loadPromise;

    expect(service.presupuestos()).toEqual([summary1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created presupuesto', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(presupuesto1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await createPromise;
    expect(result).toEqual(presupuesto1);
    expect(service.presupuestos()).toEqual([summary1]);
  });

  it('create() rejects and does not reload the list on validation failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'POST');
    postReq.flush({ message: 'El cliente indicado no existe.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('update() puts the request, reloads the list, and resolves with the updated presupuesto', async () => {
    const updatePromise = service.update('p1', updateRequest);

    const putReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'PUT');
    expect(putReq.request.body).toEqual(updateRequest);
    putReq.flush(presupuesto1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    const result = await updatePromise;
    expect(result).toEqual(presupuesto1);
  });

  it('update() rejects with a 409 when the presupuesto is not editable and does not reload the list', async () => {
    const updatePromise = service.update('p1', updateRequest);
    const putReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'PUT');
    putReq.flush(
      { message: 'Solo se pueden editar presupuestos en estado Borrador.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(updatePromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('cambiarEstado() posts the estado, reloads the list, and clears errorMessage on success', async () => {
    service.errorMessage.set('leftover error');
    const cambiarPromise = service.cambiarEstado('p1', EstadoPresupuesto.Enviado);

    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1/estado' && r.method === 'POST');
    expect(postReq.request.body).toEqual({ estado: EstadoPresupuesto.Enviado });
    postReq.flush(presupuesto1);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([summary1]);

    await cambiarPromise;
    expect(service.errorMessage()).toBeNull();
  });

  it('cambiarEstado() sets errorMessage and does not throw on failure', async () => {
    const cambiarPromise = service.cambiarEstado('p1', EstadoPresupuesto.Aceptado);
    const postReq = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1/estado' && r.method === 'POST');
    postReq.flush(
      { message: 'El presupuesto ya fue convertido en factura.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(cambiarPromise).resolves.toBeUndefined();
    expect(service.errorMessage()).toBe('El presupuesto ya fue convertido en factura.');
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });

  it('getById() gets the presupuesto by id without touching the list signals', async () => {
    const getPromise = service.getById('p1');
    const req = httpMock.expectOne((r) => r.url === '/api/presupuestos/p1' && r.method === 'GET');
    req.flush(presupuesto1);

    const result = await getPromise;
    expect(result).toEqual(presupuesto1);
    expect(service.presupuestos()).toEqual([]);
  });

  it('convertirAFactura() posts the request, reloads the list, and resolves with the created factura', async () => {
    const request: ConvertirAFacturaRequest = { serieId: 's1', porcentajeRetencionIrpf: null };
    const facturaCreada: Factura = {
      id: 'f1',
      clienteId: 'c1',
      serieId: 's1',
      numeroCompleto: 'FAC-2026-00001',
      estado: EstadoFactura.Emitida,
      fechaEmision: '2026-08-06T00:00:00Z',
      fechaVencimiento: null,
      fechaCobro: null,
      porcentajeRetencionIrpf: null,
      baseImponible: 100,
      totalIva: 21,
      totalRetencion: 0,
      total: 121,
      presupuestoOrigenId: 'p1',
      facturaRectificadaId: null,
      pdfUrl: null,
      lineas: [],
      createdAt: '2026-08-06T00:00:00Z',
    };

    const convertirPromise = service.convertirAFactura('p1', request);
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    expect(postReq.request.body).toEqual(request);
    postReq.flush(facturaCreada);

    await Promise.resolve();

    const getReq = httpMock.expectOne((r) => r.url === '/api/presupuestos' && r.method === 'GET');
    getReq.flush([]);

    const result = await convertirPromise;
    expect(result).toEqual(facturaCreada);
  });

  it('convertirAFactura() rejects and does not reload the list on failure', async () => {
    const request: ConvertirAFacturaRequest = { serieId: 's1', porcentajeRetencionIrpf: null };
    const convertirPromise = service.convertirAFactura('p1', request);
    const postReq = httpMock.expectOne(
      (r) => r.url === '/api/presupuestos/p1/convertir-a-factura' && r.method === 'POST',
    );
    postReq.flush(
      { message: 'Solo se pueden convertir presupuestos en estado Aceptado.' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(convertirPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/presupuestos' && r.method === 'GET')).toHaveLength(0);
  });
});
