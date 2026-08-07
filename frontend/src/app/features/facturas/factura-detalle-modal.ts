import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { ESTADO_FACTURA_LABELS, Factura } from '../../core/models/factura.models';
import { TIPO_IVA_LABELS, TIPO_LINEA_LABELS } from '../../core/models/presupuesto.models';

@Component({
  selector: 'app-factura-detalle-modal',
  imports: [],
  templateUrl: './factura-detalle-modal.html',
  styleUrl: './factura-detalle-modal.css',
})
export class FacturaDetalleModal {
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
}
