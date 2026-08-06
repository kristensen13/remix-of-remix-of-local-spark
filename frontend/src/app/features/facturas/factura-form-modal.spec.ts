import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { FacturaFormModal } from './factura-form-modal';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { Cliente } from '../../core/models/cliente.models';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

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

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

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
  lineas: [],
  createdAt: '2026-08-01T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('FacturaFormModal', () => {
  let component: FacturaFormModal;
  let facturasServiceStub: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    facturasServiceStub = { create: vi.fn().mockResolvedValue(factura1) };

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: ClientesService, useValue: { clientes: signal<Cliente[]>([cliente1]) } },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(FacturaFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() resets the form with one empty línea and shows the dialog', () => {
    component.clienteId.set('leftover');
    component.lineas.set([]);
    component.open();

    expect(component.clienteId()).toBe('');
    expect(component.serieId()).toBe('');
    expect(component.porcentajeRetencionIrpf()).toBeNull();
    expect(component.lineas().length).toBe(1);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesNoRectificativas() excludes series marked as rectificativa', () => {
    expect(component.seriesNoRectificativas()).toEqual([serieNormal]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.create).not.toHaveBeenCalled();
  });

  describe('línea management', () => {
    it('addLinea() appends an empty línea with a unique rowId', () => {
      component.open();
      const firstRowId = component.lineas()[0].rowId;
      component.addLinea();
      expect(component.lineas().length).toBe(2);
      expect(component.lineas()[1].rowId).not.toBe(firstRowId);
    });

    it('removeLinea() removes only the targeted row', () => {
      component.open();
      component.addLinea();
      const [row1, row2] = component.lineas();
      component.removeLinea(row1.rowId);
      expect(component.lineas()).toEqual([row2]);
    });

    it('updateLinea() patches only the targeted row', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Nueva' });
      expect(component.lineas()[0].descripcion).toBe('Nueva');
    });
  });

  describe('resumen()', () => {
    it('computes subtotal, IVA and total for a single línea without retención', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 2,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });

      expect(component.resumen().subtotal).toBe(200);
      expect(component.resumen().totalIva).toBe(42);
      expect(component.resumen().totalRetencion).toBe(0);
      expect(component.resumen().total).toBe(242);
    });

    it('subtracts retención IRPF from the total when set', () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 1,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });
      component.porcentajeRetencionIrpf.set(15);

      expect(component.resumen().totalRetencion).toBe(15);
      expect(component.resumen().total).toBe(106);
    });

    it('does not throw NaN when cantidad/precioUnitario are null', () => {
      component.open();
      expect(component.resumen().subtotal).toBe(0);
      expect(component.resumen().total).toBe(0);
    });
  });

  describe('validation', () => {
    it('blocks submit without a cliente', async () => {
      component.open();
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });
      component.serieId.set('s1');

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar un cliente.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit without a serie', async () => {
      component.open();
      component.clienteId.set('c1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar una serie.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit when porcentajeRetencionIrpf is out of the 0-100 range', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.porcentajeRetencionIrpf.set(150);
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('El porcentaje de retención debe estar entre 0 y 100.');
      expect(facturasServiceStub.create).not.toHaveBeenCalled();
    });

    it('blocks submit with no líneas', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('La factura debe tener al menos una línea.');
    });

    it('blocks submit when a línea has an empty descripción', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la descripción es obligatoria.');
    });

    it('blocks submit when a línea has cantidad <= 0', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 0, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
    });

    it('blocks submit when a línea has a negative precioUnitario', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: -5 });

      await component.onSubmit();

      expect(component.formError()).toBe('Línea 1: el precio unitario no puede ser negativo.');
    });
  });

  describe('onSubmit() success/failure', () => {
    it('calls create() with the built request, closes the dialog, and emits saved on success', async () => {
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      component.fechaVencimiento.set('2026-09-01');
      component.porcentajeRetencionIrpf.set(15);
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, {
        descripcion: 'Consultoría',
        cantidad: 1,
        precioUnitario: 100,
        tipoIva: TipoIva.General21,
      });

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      await component.onSubmit();

      expect(facturasServiceStub.create).toHaveBeenCalledWith({
        clienteId: 'c1',
        serieId: 's1',
        fechaVencimiento: '2026-09-01T00:00:00Z',
        porcentajeRetencionIrpf: 15,
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
      });
      expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
      expect(savedSpy).toHaveBeenCalled();
    });

    it('sets formError and keeps the dialog open on backend failure', async () => {
      facturasServiceStub.create.mockRejectedValue({ error: { message: 'La serie indicada no existe.' } });
      component.open();
      component.clienteId.set('c1');
      component.serieId.set('s1');
      const [row1] = component.lineas();
      component.updateLinea(row1.rowId, { descripcion: 'Línea', cantidad: 1, precioUnitario: 10 });

      await component.onSubmit();

      expect(component.formError()).toBe('La serie indicada no existe.');
      expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
    });
  });
});
