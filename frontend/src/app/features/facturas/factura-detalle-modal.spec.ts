import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

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

const factura2: Factura = {
  id: 'f2',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00002',
  estado: EstadoFactura.Cobrada,
  fechaEmision: '2026-08-05T00:00:00Z',
  fechaVencimiento: '2026-09-05T00:00:00Z',
  fechaCobro: '2026-08-20T00:00:00Z',
  porcentajeRetencionIrpf: 15,
  baseImponible: 500,
  totalIva: 105,
  totalRetencion: 75,
  total: 530,
  presupuestoOrigenId: 'p1',
  facturaRectificadaId: 'f1',
  pdfUrl: null,
  lineas: [
    {
      id: 'l2',
      tipo: TipoLinea.ServicioPrecioFijo,
      descripcion: 'Desarrollo',
      cantidad: 1,
      precioUnitario: 500,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-05T00:00:00Z',
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('FacturaDetalleModal', () => {
  let component: FacturaDetalleModal;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(FacturaDetalleModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() sets the factura signal and shows the dialog', () => {
    component.open(factura1);
    expect(component.factura()).toEqual(factura1);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('close() closes the dialog', () => {
    component.open(factura1);
    component.close();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
  });

  describe('template rendering', () => {
    it('renders factura details with full data including origin and rectificada info', () => {
      const fixture = TestBed.createComponent(FacturaDetalleModal);
      component = fixture.componentInstance;
      component.dialogEl = stubDialog();

      component.open(factura2);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('FAC-2026-00002');
      expect(text).toContain('Cobrada');
      expect(text).toContain('Generada desde el presupuesto p1');
      expect(text).toContain('Rectifica la factura f1');
      expect(text).toContain('Desarrollo');
      expect(text).toContain('Servicio a precio fijo');
      expect(text).toContain('IVA general (21%)');
      expect(text).toContain('500.00');
      expect(text).toContain('Base imponible: 500.00 €');
      expect(text).toContain('IVA: 105.00 €');
      expect(text).toContain('Retención IRPF: -75.00 €');
      expect(text).toContain('Total: 530.00 €');
    });

    it('renders factura without optional fields (all nulls/absent)', () => {
      const fixture = TestBed.createComponent(FacturaDetalleModal);
      component = fixture.componentInstance;
      component.dialogEl = stubDialog();

      component.open(factura1);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('FAC-2026-00001');
      expect(text).toContain('Emitida');
      expect(text).not.toContain('Generada desde el presupuesto');
      expect(text).not.toContain('Rectifica la factura');
      expect(text).toContain('Consultoría');
      expect(text).toContain('Servicio por horas');
      expect(text).toContain('IVA general (21%)');
      expect(text).toContain('100.00');
      expect(text).toContain('Base imponible: 100.00 €');
      expect(text).toContain('IVA: 21.00 €');
      expect(text).not.toContain('Retención IRPF');
      expect(text).toContain('Total: 121.00 €');
    });
  });
});
