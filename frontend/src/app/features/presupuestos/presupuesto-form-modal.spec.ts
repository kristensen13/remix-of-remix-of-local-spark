import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { Cliente } from '../../core/models/cliente.models';
import { EstadoPresupuesto, Presupuesto, TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const cliente1: Cliente = {
  id: 'c1',
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
  createdAt: '2026-01-01T00:00:00Z',
};

const presupuesto1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: '2026-09-15T00:00:00Z',
  notas: 'Nota',
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPrecioFijo,
      descripcion: 'Diseño web',
      cantidad: 2,
      precioUnitario: 300,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('PresupuestoFormModal', () => {
  let component: PresupuestoFormModal;
  let presupuestosServiceStub: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    presupuestosServiceStub = {
      create: vi.fn().mockResolvedValue(presupuesto1),
      update: vi.fn().mockResolvedValue(presupuesto1),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: { clientes: signal<Cliente[]>([cliente1]) } },
      ],
    });

    component = TestBed.createComponent(PresupuestoFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form with one empty línea and shows the dialog', () => {
    component.clienteId.set('leftover');
    component.lineas.set([]);
    component.openForCreate();

    expect(component.editingId()).toBeNull();
    expect(component.clienteId()).toBe('');
    expect(component.numero()).toBe('');
    expect(component.lineas().length).toBe(1);
    expect(component.lineas()[0].descripcion).toBe('');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('openForEdit() preloads the form from the given presupuesto', () => {
    component.openForEdit(presupuesto1);

    expect(component.editingId()).toBe('p1');
    expect(component.clienteId()).toBe('c1');
    expect(component.numero()).toBe('PRE-2026-001');
    expect(component.fechaValidez()).toBe('2026-09-15');
    expect(component.notas()).toBe('Nota');
    expect(component.lineas().length).toBe(1);
    expect(component.lineas()[0].descripcion).toBe('Diseño web');
    expect(component.lineas()[0].cantidad).toBe(2);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
  });

  describe('línea management', () => {
    it('addLinea() appends an empty línea with a unique rowId', () => {
      component.openForCreate();
      const firstRowId = component.lineas()[0].rowId;
      component.addLinea();

      expect(component.lineas().length).toBe(2);
      expect(component.lineas()[1].rowId).not.toBe(firstRowId);
    });

    it('removeLinea() removes only the targeted row', () => {
      component.openForCreate();
      component.addLinea();
      const [row1, row2] = component.lineas();

      component.removeLinea(row1.rowId);

      expect(component.lineas().length).toBe(1);
      expect(component.lineas()[0].rowId).toBe(row2.rowId);
    });

    it('updateLinea() patches only the targeted row, leaving others untouched', () => {
      component.openForCreate();
      component.addLinea();
      const [row1, row2] = component.lineas();

      component.updateLinea(row1.rowId, { descripcion: 'Consultoría' });

      expect(component.lineas()[0].descripcion).toBe('Consultoría');
      expect(component.lineas()[1]).toEqual(row2);
    });
  });

  describe('resumen()', () => {
    it('computes subtotal, IVA and total for a single línea', () => {
      component.openForCreate();
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { cantidad: 10, precioUnitario: 50, tipoIva: TipoIva.General21 });

      const resumen = component.resumen();
      expect(resumen.subtotal).toBe(500);
      expect(resumen.totalIva).toBe(105);
      expect(resumen.total).toBe(605);
    });

    it('breaks down IVA by tipo when líneas mix different tipos', () => {
      component.openForCreate();
      const row1 = component.lineas()[0];
      component.updateLinea(row1.rowId, { cantidad: 1, precioUnitario: 100, tipoIva: TipoIva.General21 });
      component.addLinea();
      const row2 = component.lineas()[1];
      component.updateLinea(row2.rowId, { cantidad: 1, precioUnitario: 100, tipoIva: TipoIva.Exento });

      const resumen = component.resumen();
      expect(resumen.subtotal).toBe(200);
      expect(resumen.ivaPorTipo.get(TipoIva.General21)).toBe(21);
      expect(resumen.ivaPorTipo.get(TipoIva.Exento)).toBe(0);
      expect(resumen.total).toBe(221);
    });

    it('treats null cantidad/precioUnitario as 0 without producing NaN', () => {
      component.openForCreate();
      const resumen = component.resumen();

      expect(resumen.subtotal).toBe(0);
      expect(resumen.total).toBe(0);
      expect(Number.isNaN(resumen.total)).toBe(false);
    });
  });

  describe('onSubmit() validation', () => {
    it('blocks and sets formError when no cliente is selected (create mode)', async () => {
      component.openForCreate();
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar un cliente.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when número is blank (create mode)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('El número es obligatorio.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when there are no líneas', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('El presupuesto debe tener al menos una línea.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has a blank descripción', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: '   ', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la descripción es obligatoria.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea is left with cantidad empty (null)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', precioUnitario: 1 }); // cantidad stays null

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has cantidad zero or negative', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: -2, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea is left with precioUnitario empty (null)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1 }); // precioUnitario stays null

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: el precio unitario es obligatorio.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks and sets formError when a línea has a negative precioUnitario', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: -5 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: el precio unitario no puede ser negativo.');
      expect(presupuestosServiceStub.create).not.toHaveBeenCalled();
    });
  });

  describe('onSubmit() success paths', () => {
    it('calls create() with clienteId/numero and 1-based orden on each línea (create mode)', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      component.fechaValidez.set('2026-09-15');
      component.notas.set('Nota');
      const row1 = component.lineas()[0];
      component.updateLinea(row1.rowId, {
        tipo: TipoLinea.Producto,
        descripcion: 'Licencia',
        cantidad: 3,
        precioUnitario: 20,
        tipoIva: TipoIva.Reducido10,
      });
      component.addLinea();
      const row2 = component.lineas()[1];
      component.updateLinea(row2.rowId, { descripcion: 'Soporte', cantidad: 1, precioUnitario: 100 });

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      await component.onSubmit();

      expect(presupuestosServiceStub.create).toHaveBeenCalledWith({
        clienteId: 'c1',
        numero: 'PRE-2026-002',
        fechaValidez: '2026-09-15T00:00:00Z',
        notas: 'Nota',
        lineas: [
          {
            tipo: TipoLinea.Producto,
            descripcion: 'Licencia',
            cantidad: 3,
            precioUnitario: 20,
            tipoIva: TipoIva.Reducido10,
            orden: 1,
          },
          {
            tipo: TipoLinea.ServicioPorHoras,
            descripcion: 'Soporte',
            cantidad: 1,
            precioUnitario: 100,
            tipoIva: TipoIva.General21,
            orden: 2,
          },
        ],
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
      expect(savedSpy).toHaveBeenCalled();
    });

    it('calls update(editingId) without clienteId/numero (edit mode)', async () => {
      component.openForEdit(presupuesto1);

      await component.onSubmit();

      expect(presupuestosServiceStub.update).toHaveBeenCalledWith('p1', {
        fechaValidez: '2026-09-15T00:00:00Z',
        notas: 'Nota',
        lineas: [
          {
            tipo: TipoLinea.ServicioPrecioFijo,
            descripcion: 'Diseño web',
            cantidad: 2,
            precioUnitario: 300,
            tipoIva: TipoIva.General21,
            orden: 1,
          },
        ],
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    });

    it('sends null fechaValidez/notas when left blank', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(presupuestosServiceStub.create).toHaveBeenCalledWith(
        expect.objectContaining({ fechaValidez: null, notas: null }),
      );
    });

    it('sends fechaValidez as a UTC midnight instant (T00:00:00Z), not the bare date', async () => {
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      component.fechaValidez.set('2026-09-15');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(presupuestosServiceStub.create).toHaveBeenCalledWith(
        expect.objectContaining({ fechaValidez: '2026-09-15T00:00:00Z' }),
      );
    });

    it('sets formError and keeps the dialog open on backend failure', async () => {
      presupuestosServiceStub.create.mockRejectedValue({
        error: { message: 'El cliente indicado no existe.' },
      });
      component.openForCreate();
      component.clienteId.set('c1');
      component.numero.set('PRE-2026-002');
      const row = component.lineas()[0];
      component.updateLinea(row.rowId, { descripcion: 'x', cantidad: 1, precioUnitario: 1 });

      await component.onSubmit();

      expect(component.formError()).toBe('El cliente indicado no existe.');
      expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
    });
  });
});
