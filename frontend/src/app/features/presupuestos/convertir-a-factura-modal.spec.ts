import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

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

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('ConvertirAFacturaModal', () => {
  let component: ConvertirAFacturaModal;
  let presupuestosServiceStub: { convertirAFactura: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    presupuestosServiceStub = { convertirAFactura: vi.fn().mockResolvedValue(facturaCreada) };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(ConvertirAFacturaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() resets the form and shows the dialog', () => {
    component.serieId.set('leftover');
    component.open('p1');

    expect(component.presupuestoId()).toBe('p1');
    expect(component.serieId()).toBe('');
    expect(component.porcentajeRetencionIrpf()).toBeNull();
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesNoRectificativas() excludes series marked as rectificativa', () => {
    expect(component.seriesNoRectificativas()).toEqual([serieNormal]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('blocks submit without a serie', async () => {
    component.open('p1');
    await component.onSubmit();

    expect(component.formError()).toBe('Debés seleccionar una serie.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('blocks submit when porcentajeRetencionIrpf is out of the 0-100 range', async () => {
    component.open('p1');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(150);

    await component.onSubmit();

    expect(component.formError()).toBe('El porcentaje de retención debe estar entre 0 y 100.');
    expect(presupuestosServiceStub.convertirAFactura).not.toHaveBeenCalled();
  });

  it('onSubmit() calls convertirAFactura(), closes the dialog, and emits converted on success', async () => {
    component.open('p1');
    component.serieId.set('s1');
    component.porcentajeRetencionIrpf.set(15);

    const convertedSpy = vi.fn();
    component.converted.subscribe(convertedSpy);

    await component.onSubmit();

    expect(presupuestosServiceStub.convertirAFactura).toHaveBeenCalledWith('p1', {
      serieId: 's1',
      porcentajeRetencionIrpf: 15,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(convertedSpy).toHaveBeenCalledWith(facturaCreada);
  });

  it('sets formError and keeps the dialog open on backend failure', async () => {
    presupuestosServiceStub.convertirAFactura.mockRejectedValue({
      error: { message: 'Solo se pueden convertir presupuestos en estado Aceptado.' },
    });
    component.open('p1');
    component.serieId.set('s1');

    await component.onSubmit();

    expect(component.formError()).toBe('Solo se pueden convertir presupuestos en estado Aceptado.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
