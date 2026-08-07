import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { SeriesService } from '../series/series.service';
import { ConvertirAFacturaRequest, Factura } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-convertir-a-factura-modal',
  imports: [FormsModule],
  templateUrl: './convertir-a-factura-modal.html',
  styleUrl: './convertir-a-factura-modal.css',
})
export class ConvertirAFacturaModal {
  private readonly presupuestosService = inject(PresupuestosService);
  protected readonly seriesService = inject(SeriesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly converted = output<Factura>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly presupuestoId = signal<string | null>(null);
  readonly serieId = signal('');
  readonly porcentajeRetencionIrpf = signal<number | null>(null);

  readonly seriesNoRectificativas = computed(() =>
    this.seriesService.series().filter((s) => !s.esRectificativa),
  );

  open(presupuestoId: string): void {
    this.presupuestoId.set(presupuestoId);
    this.serieId.set('');
    this.porcentajeRetencionIrpf.set(null);
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const presupuestoId = this.presupuestoId();
    if (!presupuestoId) {
      return;
    }
    if (!this.serieId()) {
      this.formError.set('Debés seleccionar una serie.');
      return;
    }

    const retencionRaw = this.porcentajeRetencionIrpf();
    let retencion: number | null = null;
    if (retencionRaw !== null && retencionRaw !== undefined) {
      const n = Number(retencionRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        this.formError.set('El porcentaje de retención debe estar entre 0 y 100.');
        return;
      }
      retencion = n;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const request: ConvertirAFacturaRequest = { serieId: this.serieId(), porcentajeRetencionIrpf: retencion };
      const factura = await this.presupuestosService.convertirAFactura(presupuestoId, request);
      this.dialogEl.nativeElement.close();
      this.converted.emit(factura);
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }
}
