import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FacturasService } from './facturas.service';
import { ClientesService } from '../clientes/clientes.service';
import { SeriesService } from '../series/series.service';
import { CreateFacturaRequest } from '../../core/models/factura.models';
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

function filaVacia(): LineaFormRow {
  return {
    rowId: crypto.randomUUID(),
    tipo: TipoLinea.ServicioPorHoras,
    descripcion: '',
    cantidad: null,
    precioUnitario: null,
    tipoIva: TipoIva.General21,
  };
}

@Component({
  selector: 'app-factura-form-modal',
  imports: [FormsModule],
  templateUrl: './factura-form-modal.html',
  styleUrl: './factura-form-modal.css',
})
export class FacturaFormModal {
  private readonly facturasService = inject(FacturasService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly seriesService = inject(SeriesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly clienteId = signal('');
  readonly serieId = signal('');
  readonly fechaVencimiento = signal('');
  readonly porcentajeRetencionIrpf = signal<number | null>(null);
  readonly lineas = signal<LineaFormRow[]>([]);

  readonly seriesNoRectificativas = computed(() =>
    this.seriesService.series().filter((s) => !s.esRectificativa),
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
    const totalRetencion = subtotal * ((this.porcentajeRetencionIrpf() ?? 0) / 100);
    return { subtotal, ivaPorTipo, totalIva, totalRetencion, total: subtotal + totalIva - totalRetencion };
  });

  open(): void {
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  addLinea(): void {
    this.lineas.update((rows) => [...rows, filaVacia()]);
  }

  removeLinea(rowId: string): void {
    this.lineas.update((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  updateLinea(rowId: string, patch: Partial<LineaFormRow>): void {
    this.lineas.update((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async onSubmit(): Promise<void> {
    if (!this.clienteId()) {
      this.formError.set('Debés seleccionar un cliente.');
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

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('La factura debe tener al menos una línea.');
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
      const request: CreateFacturaRequest = {
        clienteId: this.clienteId(),
        serieId: this.serieId(),
        fechaVencimiento: this.toInstante(this.fechaVencimiento()),
        porcentajeRetencionIrpf: retencion,
        lineas: lineasRequest,
      };
      await this.facturasService.create(request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private toInstante(fecha: string): string | null {
    return fecha ? `${fecha}T00:00:00Z` : null;
  }

  private resetForm(): void {
    this.clienteId.set('');
    this.serieId.set('');
    this.fechaVencimiento.set('');
    this.porcentajeRetencionIrpf.set(null);
    this.lineas.set([filaVacia()]);
  }
}
