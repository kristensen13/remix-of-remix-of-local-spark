import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { SeriesService } from '../series/series.service';
import { Factura, RectificarFacturaRequest } from '../../core/models/factura.models';
import {
  LineaPresupuestoRequest,
  TIPO_IVA_PORCENTAJE,
  TipoIva,
  TipoLinea,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

export interface LineaFormRow {
  rowId: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
  tipoIva: TipoIva;
}

@Component({
  selector: 'app-rectificar-modal',
  imports: [FormsModule],
  templateUrl: './rectificar-modal.html',
  styleUrl: './rectificar-modal.css',
})
export class RectificarModal {
  private readonly facturasService = inject(FacturasService);
  protected readonly seriesService = inject(SeriesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly facturaOriginalId = signal<string | null>(null);
  readonly serieRectificativaId = signal('');
  readonly motivo = signal('');
  readonly lineas = signal<LineaFormRow[]>([]);

  readonly seriesRectificativas = computed(() =>
    this.seriesService.series().filter((s) => s.esRectificativa),
  );

  readonly resumen = computed(() => {
    let subtotal = 0;
    const ivaPorTipo = new Map<TipoIva, number>();
    for (const l of this.lineas()) {
      const importe = (l.cantidad ?? 0) * (l.precioUnitario ?? 0);
      subtotal += importe;
      const iva = importe * (TIPO_IVA_PORCENTAJE[l.tipoIva] / 100);
      ivaPorTipo.set(l.tipoIva, (ivaPorTipo.get(l.tipoIva) ?? 0) + iva);
    }
    const totalIva = [...ivaPorTipo.values()].reduce((a, b) => a + b, 0);
    return { subtotal, ivaPorTipo, totalIva, total: subtotal + totalIva };
  });

  open(original: Factura): void {
    this.facturaOriginalId.set(original.id);
    this.serieRectificativaId.set('');
    this.motivo.set('');
    this.lineas.set(
      original.lineas.map((l) => ({
        rowId: crypto.randomUUID(),
        tipo: l.tipo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        tipoIva: l.tipoIva,
      })),
    );
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  addLinea(): void {
    this.lineas.update((rows) => [
      ...rows,
      {
        rowId: crypto.randomUUID(),
        tipo: TipoLinea.ServicioPorHoras,
        descripcion: '',
        cantidad: null,
        precioUnitario: null,
        tipoIva: TipoIva.General21,
      },
    ]);
  }

  removeLinea(rowId: string): void {
    this.lineas.update((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  updateLinea(rowId: string, patch: Partial<LineaFormRow>): void {
    this.lineas.update((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async onSubmit(): Promise<void> {
    const facturaOriginalId = this.facturaOriginalId();
    if (!facturaOriginalId) {
      return;
    }
    if (!this.serieRectificativaId()) {
      this.formError.set('Debés seleccionar una serie rectificativa.');
      return;
    }
    if (!this.motivo().trim()) {
      this.formError.set('El motivo es obligatorio.');
      return;
    }

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('La factura rectificativa debe tener al menos una línea.');
      return;
    }

    const lineasRequest: LineaPresupuestoRequest[] = [];
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const n = i + 1;
      const descripcion = fila.descripcion.trim();
      if (!descripcion) {
        this.formError.set(`Línea ${n}: la descripción es obligatoria.`);
        return;
      }
      const cantidad = Number(fila.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        this.formError.set(`Línea ${n}: la cantidad debe ser mayor que 0.`);
        return;
      }
      if (fila.precioUnitario === null || fila.precioUnitario === undefined) {
        this.formError.set(`Línea ${n}: el precio unitario es obligatorio.`);
        return;
      }
      const precioUnitario = Number(fila.precioUnitario);
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        this.formError.set(`Línea ${n}: el precio unitario no puede ser negativo.`);
        return;
      }
      lineasRequest.push({ tipo: fila.tipo, descripcion, cantidad, precioUnitario, tipoIva: fila.tipoIva, orden: n });
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const request: RectificarFacturaRequest = {
        serieRectificativaId: this.serieRectificativaId(),
        motivo: this.motivo().trim(),
        lineasCorregidas: lineasRequest,
      };
      await this.facturasService.rectificar(facturaOriginalId, request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }
}
