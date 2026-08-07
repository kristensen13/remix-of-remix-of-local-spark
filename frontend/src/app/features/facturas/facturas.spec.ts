import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Facturas } from './facturas';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { FacturaFormModal } from './factura-form-modal';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { RectificarModal } from './rectificar-modal';
import { Cliente } from '../../core/models/cliente.models';
import { Serie } from '../../core/models/serie.models';
import { EstadoFactura, Factura, FacturaSummary } from '../../core/models/factura.models';
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

const serie1: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 5, anio: 2026, esRectificativa: false };

const summaryEmitida: FacturaSummary = {
  id: 'f1',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00001',
  estado: EstadoFactura.Emitida,
  fechaEmision: '2026-08-01T00:00:00Z',
  total: 121,
};

const summaryCobrada: FacturaSummary = {
  id: 'f2',
  clienteId: 'c1',
  numeroCompleto: 'FAC-2026-00002',
  estado: EstadoFactura.Cobrada,
  fechaEmision: '2026-08-02T00:00:00Z',
  total: 242,
};

const summaryAnulada: FacturaSummary = {
  id: 'f3',
  clienteId: 'desconocido',
  numeroCompleto: 'FAC-2026-00003',
  estado: EstadoFactura.Anulada,
  fechaEmision: '2026-08-03T00:00:00Z',
  total: 50,
};

const detalle1: Factura = {
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

function makeStubs() {
  const facturasServiceStub = {
    facturas: signal<FacturaSummary[]>([summaryEmitida, summaryCobrada, summaryAnulada]),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    load: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(detalle1),
    anular: vi.fn().mockResolvedValue(undefined),
  };
  const clientesServiceStub = {
    clientes: signal<Cliente[]>([cliente1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  const seriesServiceStub = {
    series: signal<Serie[]>([serie1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { facturasServiceStub, clientesServiceStub, seriesServiceStub };
}

describe('Facturas', () => {
  let component: Facturas;
  let facturasServiceStub: ReturnType<typeof makeStubs>['facturasServiceStub'];
  let clientesServiceStub: ReturnType<typeof makeStubs>['clientesServiceStub'];
  let seriesServiceStub: ReturnType<typeof makeStubs>['seriesServiceStub'];

  beforeEach(() => {
    const stubs = makeStubs();
    facturasServiceStub = stubs.facturasServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    seriesServiceStub = stubs.seriesServiceStub;

    TestBed.configureTestingModule({
      providers: [
        { provide: FacturasService, useValue: facturasServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
        { provide: SeriesService, useValue: seriesServiceStub },
      ],
    });

    component = TestBed.createComponent(Facturas).componentInstance;
    component.formModal = { open: vi.fn() } as unknown as FacturaFormModal;
    component.detalleModal = { open: vi.fn() } as unknown as FacturaDetalleModal;
    component.marcarCobradaModal = { open: vi.fn() } as unknown as MarcarCobradaModal;
    component.rectificarModal = { open: vi.fn() } as unknown as RectificarModal;
  });

  it('ngOnInit() loads facturas, clientes, and series', () => {
    component.ngOnInit();
    expect(facturasServiceStub.load).toHaveBeenCalledWith();
    expect(clientesServiceStub.load).toHaveBeenCalled();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('nombreCliente() resolves the cliente name or a fallback', () => {
    expect(component.nombreCliente('c1')).toBe('Acme SL');
    expect(component.nombreCliente('desconocido')).toBe('—');
  });

  describe('facturasFiltradas()', () => {
    it('returns all facturas when no filter is set', () => {
      expect(component.facturasFiltradas()).toEqual([summaryEmitida, summaryCobrada, summaryAnulada]);
    });

    it('filters by estado', () => {
      component.filtroEstado.set(EstadoFactura.Cobrada);
      expect(component.facturasFiltradas()).toEqual([summaryCobrada]);
    });

    it('filters by número (case-insensitive substring)', () => {
      component.filtroNumero.set('00002');
      expect(component.facturasFiltradas()).toEqual([summaryCobrada]);
    });

    it('filters by número case-insensitively regardless of stored case', () => {
      component.filtroNumero.set('fac-2026-00003');
      expect(component.facturasFiltradas()).toEqual([summaryAnulada]);
    });

    it('combines estado and número filters', () => {
      component.filtroEstado.set(EstadoFactura.Emitida);
      component.filtroNumero.set('00002');
      expect(component.facturasFiltradas()).toEqual([]);
    });
  });

  it('onFiltroClienteChange() updates the signal and reloads facturas scoped to the cliente', () => {
    component.onFiltroClienteChange('c1');
    expect(component.filtroClienteId()).toBe('c1');
    expect(facturasServiceStub.load).toHaveBeenCalledWith('c1');
  });

  it('onFiltroClienteChange() with an empty string reloads without a cliente filter', () => {
    component.onFiltroClienteChange('');
    expect(component.filtroClienteId()).toBe('');
    expect(facturasServiceStub.load).toHaveBeenCalledWith(undefined);
  });

  it('onNew() opens the form modal', () => {
    component.onNew();
    expect(component.formModal.open).toHaveBeenCalled();
  });

  it('onVerDetalle() fetches the detail and opens the detalle modal', async () => {
    await component.onVerDetalle(summaryEmitida);
    expect(facturasServiceStub.getById).toHaveBeenCalledWith('f1');
    expect(component.detalleModal.open).toHaveBeenCalledWith(detalle1);
  });

  it('onVerDetalle() sets errorMessage and does not open the modal when getById fails', async () => {
    facturasServiceStub.getById.mockRejectedValue({ error: { message: 'No encontrado.' } });

    await component.onVerDetalle(summaryEmitida);

    expect(facturasServiceStub.errorMessage()).toBe('No encontrado.');
    expect(component.detalleModal.open).not.toHaveBeenCalled();
  });

  it('onMarcarCobrada() opens the marcar-cobrada modal with the factura id', () => {
    component.onMarcarCobrada(summaryEmitida);
    expect(component.marcarCobradaModal.open).toHaveBeenCalledWith('f1');
  });

  describe('onAnular()', () => {
    it('calls anular() when confirmed', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
      await component.onAnular(summaryEmitida);
      expect(facturasServiceStub.anular).toHaveBeenCalledWith('f1');
    });

    it('does not call anular() when cancelled', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
      await component.onAnular(summaryEmitida);
      expect(facturasServiceStub.anular).not.toHaveBeenCalled();
    });
  });

  it('onRectificar() fetches the detail and opens the rectificar modal', async () => {
    await component.onRectificar(summaryEmitida);
    expect(facturasServiceStub.getById).toHaveBeenCalledWith('f1');
    expect(component.rectificarModal.open).toHaveBeenCalledWith(detalle1);
  });

  it('onRectificar() sets errorMessage and does not open the modal when getById fails', async () => {
    facturasServiceStub.getById.mockRejectedValue({ error: { message: 'No encontrado.' } });

    await component.onRectificar(summaryEmitida);

    expect(facturasServiceStub.errorMessage()).toBe('No encontrado.');
    expect(component.rectificarModal.open).not.toHaveBeenCalled();
  });

  describe('template rendering', () => {
    function render() {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      TestBed.configureTestingModule({
        providers: [
          { provide: FacturasService, useValue: stubs.facturasServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
          { provide: SeriesService, useValue: stubs.seriesServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(Facturas);
      fixture.detectChanges();
      return fixture;
    }

    it('renders one row per factura with the resolved cliente name', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('FAC-2026-00001');
      expect(text).toContain('Acme SL');
    });

    it('shows "Marcar cobrada", "Rectificar", and "Anular" for Emitida rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const emitidaRow = rows[0] as HTMLElement;
      expect(emitidaRow.textContent).toContain('Marcar cobrada');
      expect(emitidaRow.textContent).toContain('Rectificar');
      expect(emitidaRow.textContent).toContain('Anular');
    });

    it('shows "Rectificar" and "Anular" but not "Marcar cobrada" for Cobrada rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const cobradaRow = rows[1] as HTMLElement;
      expect(cobradaRow.textContent).not.toContain('Marcar cobrada');
      expect(cobradaRow.textContent).toContain('Rectificar');
      expect(cobradaRow.textContent).toContain('Anular');
    });

    it('shows only "Ver detalle" (no other actions) for Anulada rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const anuladaRow = rows[2] as HTMLElement;
      expect(anuladaRow.textContent).toContain('Ver detalle');
      expect(anuladaRow.textContent).not.toContain('Marcar cobrada');
      expect(anuladaRow.textContent).not.toContain('Rectificar');
      expect(anuladaRow.textContent).not.toContain('Anular');
    });

    it('filters the rendered rows by estado', () => {
      const fixture = render();
      const select = fixture.nativeElement.querySelectorAll('select')[1] as HTMLSelectElement;
      const component = fixture.componentInstance as Facturas;
      component.filtroEstado.set(EstadoFactura.Cobrada);
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect((rows[0] as HTMLElement).textContent).toContain('FAC-2026-00002');
      void select;
    });

    it('filters the rendered rows by número', () => {
      const fixture = render();
      const component = fixture.componentInstance as Facturas;
      component.filtroNumero.set('00003');
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect((rows[0] as HTMLElement).textContent).toContain('FAC-2026-00003');
    });

    it('shows the empty-state message when there are no facturas matching the filters', () => {
      const fixture = render();
      const component = fixture.componentInstance as Facturas;
      component.filtroNumero.set('no-existe');
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('No hay facturas que coincidan con los filtros.');
    });
  });
});
