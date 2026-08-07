import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { FacturaFormModal } from './factura-form-modal';
import { FacturaDetalleModal } from './factura-detalle-modal';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { RectificarModal } from './rectificar-modal';
import { ESTADO_FACTURA_LABELS, EstadoFactura, FacturaSummary } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-facturas',
  imports: [FormsModule, FacturaFormModal, FacturaDetalleModal, MarcarCobradaModal, RectificarModal],
  templateUrl: './facturas.html',
  styleUrl: './facturas.css',
})
export class Facturas implements OnInit {
  protected readonly facturasService = inject(FacturasService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly seriesService = inject(SeriesService);
  protected readonly EstadoFactura = EstadoFactura;
  protected readonly ESTADO_FACTURA_LABELS = ESTADO_FACTURA_LABELS;

  @ViewChild(FacturaFormModal) formModal!: FacturaFormModal;
  @ViewChild(FacturaDetalleModal) detalleModal!: FacturaDetalleModal;
  @ViewChild(MarcarCobradaModal) marcarCobradaModal!: MarcarCobradaModal;
  @ViewChild(RectificarModal) rectificarModal!: RectificarModal;

  readonly filtroClienteId = signal('');
  readonly filtroEstado = signal<EstadoFactura | null>(null);
  readonly filtroNumero = signal('');

  readonly facturasFiltradas = computed(() => {
    const estado = this.filtroEstado();
    const numero = this.filtroNumero().trim().toLowerCase();
    return this.facturasService.facturas().filter((f) => {
      if (estado !== null && f.estado !== estado) {
        return false;
      }
      if (numero && !f.numeroCompleto.toLowerCase().includes(numero)) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    void this.facturasService.load();
    void this.clientesService.load();
    void this.seriesService.load();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }

  onFiltroClienteChange(clienteId: string): void {
    this.filtroClienteId.set(clienteId);
    void this.facturasService.load(clienteId || undefined);
  }

  onNew(): void {
    this.formModal.open();
  }

  async onVerDetalle(f: FacturaSummary): Promise<void> {
    try {
      const detalle = await this.facturasService.getById(f.id);
      this.detalleModal.open(detalle);
    } catch (error) {
      this.facturasService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  onMarcarCobrada(f: FacturaSummary): void {
    this.marcarCobradaModal.open(f.id);
  }

  async onAnular(f: FacturaSummary): Promise<void> {
    if (!confirm(`¿Anular la factura ${f.numeroCompleto}?`)) {
      return;
    }
    await this.facturasService.anular(f.id);
  }

  async onRectificar(f: FacturaSummary): Promise<void> {
    try {
      const detalle = await this.facturasService.getById(f.id);
      this.rectificarModal.open(detalle);
    } catch (error) {
      this.facturasService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  onSaved(): void {
    // No-op: FacturasService.create()/rectificar() already reload the list
    // themselves, and the modals close themselves on success. Bound to
    // (saved) only so the modals' documented outputs have a consumer.
  }
}
