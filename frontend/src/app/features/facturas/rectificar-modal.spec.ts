import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { RectificarModal } from './rectificar-modal';
import { FacturasService } from './facturas.service';
import { SeriesService } from '../series/series.service';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura } from '../../core/models/factura.models';
import { TipoIva, TipoLinea } from '../../core/models/presupuesto.models';

const serieNormal: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 5, anio: 2026, esRectificativa: false };
const serieRectificativa: Serie = { id: 's2', codigo: 'FAC-R', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: true };

const facturaOriginal: Factura = {
  id: 'f1',
  clienteId: 'c1',
  serieId: 's1',
  numeroCompleto: 'FAC-2026-00005',
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

describe('RectificarModal', () => {
  let component: RectificarModal;
  let facturasServiceStub: { rectificar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    facturasServiceStub = { rectificar: vi.fn().mockResolvedValue(facturaOriginal) };

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: SeriesService, useValue: { series: signal<Serie[]>([serieNormal, serieRectificativa]) } },
      ],
    });

    component = TestBed.createComponent(RectificarModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() preloads líneas from the original factura with new rowIds and all fields', () => {
    component.open(facturaOriginal);

    expect(component.facturaOriginalId()).toBe('f1');
    expect(component.lineas().length).toBe(1);
    const loadedLinea = component.lineas()[0];
    expect(loadedLinea.descripcion).toBe('Consultoría');
    expect(loadedLinea.cantidad).toBe(1);
    expect(loadedLinea.precioUnitario).toBe(100);
    expect(loadedLinea.tipo).toBe(TipoLinea.ServicioPorHoras);
    expect(loadedLinea.tipoIva).toBe(TipoIva.General21);
    expect(loadedLinea.rowId).not.toBe('l1');
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('seriesRectificativas() excludes non-rectificativa series', () => {
    expect(component.seriesRectificativas()).toEqual([serieRectificativa]);
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
  });

  describe('validation', () => {
    it('blocks submit without a serie rectificativa', async () => {
      component.open(facturaOriginal);
      component.motivo.set('Error en el importe');

      await component.onSubmit();

      expect(component.formError()).toBe('Debés seleccionar una serie rectificativa.');
      expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
    });

    it('blocks submit without a motivo', async () => {
      component.open(facturaOriginal);
      component.serieRectificativaId.set('s2');

      await component.onSubmit();

      expect(component.formError()).toBe('El motivo es obligatorio.');
      expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
    });

    it('blocks submit with no líneas', async () => {
      component.open(facturaOriginal);
      component.serieRectificativaId.set('s2');
      component.motivo.set('Error en el importe');
      component.lineas.set([]);

      await component.onSubmit();

      expect(component.formError()).toBe('La factura rectificativa debe tener al menos una línea.');
    });

    describe('per-línea validation', () => {
      it('blocks submit when a línea has an empty descripción', async () => {
        component.open(facturaOriginal);
        component.serieRectificativaId.set('s2');
        component.motivo.set('Error en el importe');
        const [row1] = component.lineas();
        component.updateLinea(row1.rowId, { descripcion: '' });

        await component.onSubmit();

        expect(component.formError()).toBe('Línea 1: la descripción es obligatoria.');
        expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
      });

      it('blocks submit when a línea has cantidad <= 0', async () => {
        component.open(facturaOriginal);
        component.serieRectificativaId.set('s2');
        component.motivo.set('Error en el importe');
        const [row1] = component.lineas();
        component.updateLinea(row1.rowId, { cantidad: 0 });

        await component.onSubmit();

        expect(component.formError()).toBe('Línea 1: la cantidad debe ser mayor que 0.');
        expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
      });

      it('blocks submit when a línea has missing precioUnitario', async () => {
        component.open(facturaOriginal);
        component.serieRectificativaId.set('s2');
        component.motivo.set('Error en el importe');
        const [row1] = component.lineas();
        component.updateLinea(row1.rowId, { precioUnitario: null });

        await component.onSubmit();

        expect(component.formError()).toBe('Línea 1: el precio unitario es obligatorio.');
        expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
      });

      it('blocks submit when a línea has a negative precioUnitario', async () => {
        component.open(facturaOriginal);
        component.serieRectificativaId.set('s2');
        component.motivo.set('Error en el importe');
        const [row1] = component.lineas();
        component.updateLinea(row1.rowId, { precioUnitario: -5 });

        await component.onSubmit();

        expect(component.formError()).toBe('Línea 1: el precio unitario no puede ser negativo.');
        expect(facturasServiceStub.rectificar).not.toHaveBeenCalled();
      });
    });
  });

  it('onSubmit() calls rectificar() with the built request, closes the dialog, and emits saved on success', async () => {
    component.open(facturaOriginal);
    component.serieRectificativaId.set('s2');
    component.motivo.set('Error en el importe');
    const [row1] = component.lineas();
    component.updateLinea(row1.rowId, { precioUnitario: 90 });

    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    await component.onSubmit();

    expect(facturasServiceStub.rectificar).toHaveBeenCalledWith('f1', {
      serieRectificativaId: 's2',
      motivo: 'Error en el importe',
      lineasCorregidas: [
        {
          tipo: TipoLinea.ServicioPorHoras,
          descripcion: 'Consultoría',
          cantidad: 1,
          precioUnitario: 90,
          tipoIva: TipoIva.General21,
          orden: 1,
        },
      ],
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('sets formError and keeps the dialog open on backend failure', async () => {
    facturasServiceStub.rectificar.mockRejectedValue({
      error: { message: 'La serie indicada no está marcada como rectificativa.' },
    });
    component.open(facturaOriginal);
    component.serieRectificativaId.set('s2');
    component.motivo.set('Error en el importe');

    await component.onSubmit();

    expect(component.formError()).toBe('La serie indicada no está marcada como rectificativa.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
