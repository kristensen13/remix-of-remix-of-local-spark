import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientesService } from './clientes.service';
import { Cliente, CreateClienteRequest } from '../../core/models/cliente.models';

const cliente1: Cliente = {
  id: 'c1',
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: '28001',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  pais: 'España',
  email: 'acme@example.com',
  telefono: '600111222',
  esAutonomoOProfesional: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const createRequest: CreateClienteRequest = {
  nombre: 'Acme SL',
  nif: 'B12345678',
  direccion: 'Calle Mayor 1',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: null,
  email: null,
  telefono: null,
  esAutonomoOProfesional: false,
};

describe('ClientesService', () => {
  let service: ClientesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ClientesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads clientes on load()', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    req.flush([cliente1]);
    await loadPromise;

    expect(service.clientes()).toEqual([cliente1]);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('sets errorMessage on load failure', async () => {
    const loadPromise = service.load();
    const req = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    req.flush({ message: 'Error inesperado.' }, { status: 500, statusText: 'Server Error' });
    await loadPromise;

    expect(service.errorMessage()).toBe('Error inesperado.');
  });

  it('create() posts the request, reloads the list, and resolves with the created cliente', async () => {
    const createPromise = service.create(createRequest);

    const postReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'POST');
    expect(postReq.request.body).toEqual(createRequest);
    postReq.flush(cliente1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([cliente1]);

    const result = await createPromise;
    expect(result).toEqual(cliente1);
    expect(service.clientes()).toEqual([cliente1]);
  });

  it('create() rejects and does not reload the list on failure', async () => {
    const createPromise = service.create(createRequest);
    const postReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'POST');
    postReq.flush({ message: 'Nombre y NIF son obligatorios.' }, { status: 400, statusText: 'Bad Request' });

    await expect(createPromise).rejects.toBeTruthy();
    expect(httpMock.match((r) => r.url === '/api/clientes' && r.method === 'GET')).toHaveLength(0);
  });

  it('update() puts the request to /api/clientes/{id} and reloads the list', async () => {
    const updatePromise = service.update('c1', createRequest);

    const putReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'PUT');
    expect(putReq.request.body).toEqual(createRequest);
    putReq.flush(cliente1);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([cliente1]);

    const result = await updatePromise;
    expect(result).toEqual(cliente1);
  });

  it('remove() deletes and reloads the list', async () => {
    const removePromise = service.remove('c1');

    const deleteReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'DELETE');
    deleteReq.flush(null);

    await Promise.resolve(); // Yield to event loop for GET to be made

    const getReq = httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET');
    getReq.flush([]);

    await removePromise;
    expect(service.clientes()).toEqual([]);
    expect(service.errorMessage()).toBeNull();
  });

  it('remove() sets errorMessage on 409 conflict without reloading or clearing clientes', async () => {
    const loadPromise = service.load();
    httpMock.expectOne((r) => r.url === '/api/clientes' && r.method === 'GET').flush([cliente1]);
    await loadPromise;

    const removePromise = service.remove('c1');
    const deleteReq = httpMock.expectOne((r) => r.url === '/api/clientes/c1' && r.method === 'DELETE');
    deleteReq.flush(
      { message: 'No se puede eliminar un cliente con facturas o presupuestos asociados.' },
      { status: 409, statusText: 'Conflict' },
    );
    await removePromise;

    expect(service.errorMessage()).toBe('No se puede eliminar un cliente con facturas o presupuestos asociados.');
    expect(service.clientes()).toEqual([cliente1]);
    expect(httpMock.match((r) => r.url === '/api/clientes' && r.method === 'GET')).toHaveLength(0);
  });
});
