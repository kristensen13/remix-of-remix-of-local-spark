import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { ClienteFormModal } from './cliente-form-modal';
import { ClientesService } from './clientes.service';
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

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('ClienteFormModal', () => {
  let component: ClienteFormModal;
  let clientesServiceStub: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clientesServiceStub = {
      create: vi.fn().mockResolvedValue(cliente1),
      update: vi.fn().mockResolvedValue(cliente1),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ClientesService, useValue: clientesServiceStub }],
    });

    component = TestBed.createComponent(ClienteFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form to defaults and shows the dialog', () => {
    component.nombre.set('leftover');
    component.openForCreate();

    expect(component.editingId()).toBeNull();
    expect(component.nombre()).toBe('');
    expect(component.pais()).toBe('España');
    expect(component.esAutonomoOProfesional()).toBe(false);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('openForEdit() preloads the form from the given cliente', () => {
    component.openForEdit(cliente1);

    expect(component.editingId()).toBe('c1');
    expect(component.nombre()).toBe('Acme SL');
    expect(component.nif()).toBe('B12345678');
    expect(component.email()).toBe('acme@example.com');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(clientesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when nombre, nif or direccion are blank', async () => {
    component.openForCreate();
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(component.formError()).toBe('Nombre, NIF y Dirección son obligatorios.');
    expect(clientesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() calls create() in create mode, closes the dialog, and emits saved', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);
    component.openForCreate();
    component.nombre.set('Acme SL');
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(clientesServiceStub.create).toHaveBeenCalledWith({
      nombre: 'Acme SL',
      nif: 'B12345678',
      direccion: 'Calle Mayor 1',
      codigoPostal: null,
      ciudad: null,
      provincia: null,
      pais: 'España',
      email: null,
      telefono: null,
      esAutonomoOProfesional: false,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('onSubmit() calls update() with the editing id in edit mode', async () => {
    component.openForEdit(cliente1);

    await component.onSubmit();

    expect(clientesServiceStub.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ nombre: 'Acme SL', nif: 'B12345678' }),
    );
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    clientesServiceStub.create.mockRejectedValue({ error: { message: 'Nombre y NIF son obligatorios.' } });
    component.openForCreate();
    component.nombre.set('Acme SL');
    component.nif.set('B12345678');
    component.direccion.set('Calle Mayor 1');

    await component.onSubmit();

    expect(component.formError()).toBe('Nombre y NIF son obligatorios.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
