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
});
