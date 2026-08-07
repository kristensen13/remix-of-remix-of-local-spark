import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ESTADO_FACTURA_LABELS, Factura } from '../../core/models/factura.models';
import { TIPO_IVA_LABELS, TIPO_LINEA_LABELS } from '../../core/models/presupuesto.models';
import { ClientesService } from '../clientes/clientes.service';

@Component({
  selector: 'app-factura-detalle-modal',
  imports: [],
  templateUrl: './factura-detalle-modal.html',
  styleUrl: './factura-detalle-modal.css',
})
export class FacturaDetalleModal {
  protected readonly clientesService = inject(ClientesService);
  protected readonly ESTADO_FACTURA_LABELS = ESTADO_FACTURA_LABELS;
  protected readonly TIPO_LINEA_LABELS = TIPO_LINEA_LABELS;
  protected readonly TIPO_IVA_LABELS = TIPO_IVA_LABELS;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly factura = signal<Factura | null>(null);

  open(factura: Factura): void {
    this.factura.set(factura);
    this.dialogEl.nativeElement.showModal();
  }

  close(): void {
    this.dialogEl.nativeElement.close();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }
}
