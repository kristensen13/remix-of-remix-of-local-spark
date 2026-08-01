import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Clientes } from './clientes';
import { ClientesService } from './clientes.service';
import { ClienteFormModal } from './cliente-form-modal';
import { Cliente } from '../../core/models/cliente.models';

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

const cliente2: Cliente = {
  id: 'c2',
  nombre: 'Beta Autónomo',
  nif: '12345678Z',
  direccion: 'Av. Libertad 5',
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: 'España',
  email: null,
  telefono: null,
  esAutonomoOProfesional: true,
  createdAt: '2026-01-02T00:00:00Z',
};

describe('Clientes', () => {
  let component: Clientes;
  let clientesServiceStub: {
    clientes: ReturnType<typeof signal<Cliente[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    errorMessage: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let modalStub: { openForCreate: ReturnType<typeof vi.fn>; openForEdit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clientesServiceStub = {
      clientes: signal<Cliente[]>([cliente1, cliente2]),
      isLoading: signal(false),
      errorMessage: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    modalStub = { openForCreate: vi.fn(), openForEdit: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: ClientesService, useValue: clientesServiceStub }],
    });

    component = TestBed.createComponent(Clientes).componentInstance;
    component.modal = modalStub as unknown as ClienteFormModal;
  });

  it('ngOnInit() loads clientes', () => {
    component.ngOnInit();
    expect(clientesServiceStub.load).toHaveBeenCalled();
  });

  it('filteredClientes() returns all clientes when searchTerm is empty', () => {
    expect(component.filteredClientes()).toEqual([cliente1, cliente2]);
  });

  it('filteredClientes() filters by nombre, case-insensitively', () => {
    component.searchTerm.set('acme');
    expect(component.filteredClientes()).toEqual([cliente1]);
  });

  it('filteredClientes() filters by nif', () => {
    component.searchTerm.set('12345678Z');
    expect(component.filteredClientes()).toEqual([cliente2]);
  });

  it('onNew() opens the modal in create mode', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  it('onEdit() opens the modal in edit mode with the given cliente', () => {
    component.onEdit(cliente1);
    expect(modalStub.openForEdit).toHaveBeenCalledWith(cliente1);
  });

  it('onDelete() does nothing when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.onDelete(cliente1);
    expect(clientesServiceStub.remove).not.toHaveBeenCalled();
  });

  it('onDelete() calls remove() with the cliente id when the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await component.onDelete(cliente1);
    expect(clientesServiceStub.remove).toHaveBeenCalledWith('c1');
  });
});
