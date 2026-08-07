import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Presupuestos } from './presupuestos';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import { ConvertirAFacturaModal } from './convertir-a-factura-modal';
import { Cliente } from '../../core/models/cliente.models';
import { Serie } from '../../core/models/serie.models';
import {
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  TipoIva,
  TipoLinea,
} from '../../core/models/presupuesto.models';

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

const summaryBorrador: PresupuestoSummary = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: null,
};

const summaryEnviado: PresupuestoSummary = {
  id: 'p2',
  clienteId: 'c1',
  numero: 'PRE-2026-002',
  estado: EstadoPresupuesto.Enviado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 2,
  facturaId: null,
};

const summaryAceptado: PresupuestoSummary = {
  id: 'p3',
  clienteId: 'desconocido',
  numero: 'PRE-2026-003',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: null,
};

const summaryAceptadoConvertido: PresupuestoSummary = {
  id: 'p4',
  clienteId: 'c1',
  numero: 'PRE-2026-004',
  estado: EstadoPresupuesto.Aceptado,
  fechaEmision: '2026-08-01T00:00:00Z',
  numeroLineas: 1,
  facturaId: 'f1',
};

const serie1: Serie = { id: 's1', codigo: 'FAC', descripcion: null, ultimoNumero: 0, anio: 2026, esRectificativa: false };

const detalle1: Presupuesto = {
  id: 'p1',
  clienteId: 'c1',
  numero: 'PRE-2026-001',
  estado: EstadoPresupuesto.Borrador,
  fechaEmision: '2026-08-01T00:00:00Z',
  fechaValidez: null,
  notas: null,
  facturaId: null,
  lineas: [
    {
      id: 'l1',
      tipo: TipoLinea.ServicioPorHoras,
      descripcion: 'Diseño',
      cantidad: 1,
      precioUnitario: 100,
      tipoIva: TipoIva.General21,
      orden: 1,
    },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

function makeStubs() {
  const presupuestosServiceStub = {
    presupuestos: signal<PresupuestoSummary[]>([summaryBorrador, summaryEnviado, summaryAceptado, summaryAceptadoConvertido]),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    load: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(detalle1),
    cambiarEstado: vi.fn().mockResolvedValue(undefined),
  };
  const clientesServiceStub = {
    clientes: signal<Cliente[]>([cliente1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  const seriesServiceStub = {
    series: signal<Serie[]>([serie1]),
    load: vi.fn().mockResolvedValue(undefined),
  };
  return { presupuestosServiceStub, clientesServiceStub, seriesServiceStub };
}

describe('Presupuestos', () => {
  let component: Presupuestos;
  let presupuestosServiceStub: ReturnType<typeof makeStubs>['presupuestosServiceStub'];
  let clientesServiceStub: ReturnType<typeof makeStubs>['clientesServiceStub'];
  let seriesServiceStub: ReturnType<typeof makeStubs>['seriesServiceStub'];
  let routerStub: { navigate: ReturnType<typeof vi.fn> };
  let modalStub: { openForCreate: ReturnType<typeof vi.fn>; openForEdit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const stubs = makeStubs();
    presupuestosServiceStub = stubs.presupuestosServiceStub;
    clientesServiceStub = stubs.clientesServiceStub;
    seriesServiceStub = stubs.seriesServiceStub;
    routerStub = { navigate: vi.fn() };
    modalStub = { openForCreate: vi.fn(), openForEdit: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: PresupuestosService, useValue: presupuestosServiceStub },
        { provide: ClientesService, useValue: clientesServiceStub },
        { provide: SeriesService, useValue: seriesServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    });

    component = TestBed.createComponent(Presupuestos).componentInstance;
    component.modal = modalStub as unknown as PresupuestoFormModal;
    component.convertirModal = { open: vi.fn() } as unknown as ConvertirAFacturaModal;
  });

  it('ngOnInit() loads presupuestos and clientes', () => {
    component.ngOnInit();
    expect(presupuestosServiceStub.load).toHaveBeenCalled();
    expect(clientesServiceStub.load).toHaveBeenCalled();
  });

  it('nombreCliente() resolves the cliente name or a fallback', () => {
    expect(component.nombreCliente('c1')).toBe('Acme SL');
    expect(component.nombreCliente('desconocido')).toBe('—');
  });

  it('onNew() opens the modal for create', () => {
    component.onNew();
    expect(modalStub.openForCreate).toHaveBeenCalled();
  });

  it('onEdit() fetches the detail and opens the modal for edit', async () => {
    await component.onEdit(summaryBorrador);
    expect(presupuestosServiceStub.getById).toHaveBeenCalledWith('p1');
    expect(modalStub.openForEdit).toHaveBeenCalledWith(detalle1);
  });

  it('onEdit() sets errorMessage and does not open the modal when getById fails', async () => {
    presupuestosServiceStub.getById.mockRejectedValue({ error: { message: 'No encontrado.' } });

    await component.onEdit(summaryBorrador);

    expect(presupuestosServiceStub.errorMessage()).toBe('No encontrado.');
    expect(modalStub.openForEdit).not.toHaveBeenCalled();
  });

  it('onEnviar() cambia el estado a Enviado', async () => {
    await component.onEnviar(summaryBorrador);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p1', EstadoPresupuesto.Enviado);
  });

  it('onAceptar() cambia el estado a Aceptado', async () => {
    await component.onAceptar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p2', EstadoPresupuesto.Aceptado);
  });

  it('onRechazar() cambia el estado a Rechazado tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await component.onRechazar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).toHaveBeenCalledWith('p2', EstadoPresupuesto.Rechazado);
  });

  it('onRechazar() no hace nada si se cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await component.onRechazar(summaryEnviado);
    expect(presupuestosServiceStub.cambiarEstado).not.toHaveBeenCalled();
  });

  it('ngOnInit() also loads series', () => {
    component.ngOnInit();
    expect(seriesServiceStub.load).toHaveBeenCalled();
  });

  it('onConvertirAFactura() opens the convertir modal with the presupuesto id', () => {
    component.onConvertirAFactura(summaryAceptado);
    expect(component.convertirModal.open).toHaveBeenCalledWith('p3');
  });

  it('onFacturaCreada() navigates to /facturas', () => {
    component.onFacturaCreada();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/facturas']);
  });

  describe('template rendering', () => {
    function render() {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      TestBed.configureTestingModule({
        providers: [
          { provide: PresupuestosService, useValue: stubs.presupuestosServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
          { provide: SeriesService, useValue: stubs.seriesServiceStub },
          { provide: Router, useValue: { navigate: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(Presupuestos);
      fixture.detectChanges();
      return fixture;
    }

    it('renders one row per presupuesto with the resolved cliente name', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('PRE-2026-001');
      expect(text).toContain('Acme SL');
    });

    it('shows Editar/Enviar only for Borrador rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const borradorRow = rows[0] as HTMLElement;
      expect(borradorRow.textContent).toContain('Editar');
      expect(borradorRow.textContent).toContain('Enviar');
      expect(borradorRow.textContent).not.toContain('Aceptar');
    });

    it('shows Aceptar/Rechazar only for Enviado rows', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const enviadoRow = rows[1] as HTMLElement;
      expect(enviadoRow.textContent).toContain('Aceptar');
      expect(enviadoRow.textContent).toContain('Rechazar');
      expect(enviadoRow.textContent).not.toContain('Editar');
    });

    it('shows Convertir a factura only for Aceptado rows without a factura yet', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const aceptadoRow = rows[2] as HTMLElement;
      expect(aceptadoRow.textContent).toContain('Convertir a factura');
      expect(aceptadoRow.textContent).not.toContain('Editar');
      expect(aceptadoRow.textContent).not.toContain('Aceptar');
    });

    it('shows no action buttons for Aceptado rows already converted', () => {
      const fixture = render();
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const convertidaRow = rows[3] as HTMLElement;
      expect(convertidaRow.textContent).not.toContain('Convertir a factura');
      expect(convertidaRow.textContent).not.toContain('Editar');
      expect(convertidaRow.textContent).not.toContain('Aceptar');
    });

    it('shows the empty-state message when there are no presupuestos', () => {
      TestBed.resetTestingModule();
      const stubs = makeStubs();
      stubs.presupuestosServiceStub.presupuestos.set([]);
      TestBed.configureTestingModule({
        providers: [
          { provide: PresupuestosService, useValue: stubs.presupuestosServiceStub },
          { provide: ClientesService, useValue: stubs.clientesServiceStub },
          { provide: SeriesService, useValue: stubs.seriesServiceStub },
          { provide: Router, useValue: { navigate: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(Presupuestos);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Todavía no hay presupuestos — creá el primero con "Nuevo presupuesto".');
    });
  });
});
