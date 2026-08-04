import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import {
  CreatePresupuestoRequest,
  LineaPresupuestoRequest,
  Presupuesto,
  TIPO_IVA_PORCENTAJE,
  TipoIva,
  TipoLinea,
  UpdatePresupuestoRequest,
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
  selector: 'app-presupuesto-form-modal',
  imports: [FormsModule],
  templateUrl: './presupuesto-form-modal.html',
  styleUrl: './presupuesto-form-modal.css',
})
export class PresupuestoFormModal {
  private readonly presupuestosService = inject(PresupuestosService);
  protected readonly clientesService = inject(ClientesService);

  protected readonly TipoLinea = TipoLinea;
  protected readonly TipoIva = TipoIva;

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  readonly clienteId = signal('');
  readonly numero = signal('');
  readonly fechaValidez = signal('');
  readonly notas = signal('');
  readonly lineas = signal<LineaFormRow[]>([]);

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

  openForCreate(): void {
    this.editingId.set(null);
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  openForEdit(presupuesto: Presupuesto): void {
    this.editingId.set(presupuesto.id);
    this.clienteId.set(presupuesto.clienteId);
    this.numero.set(presupuesto.numero);
    this.fechaValidez.set(presupuesto.fechaValidez ? presupuesto.fechaValidez.slice(0, 10) : '');
    this.notas.set(presupuesto.notas ?? '');
    this.lineas.set(
      presupuesto.lineas.map((l) => ({
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
    this.lineas.update((rows) => [...rows, filaVacia()]);
  }

  removeLinea(rowId: string): void {
    this.lineas.update((rows) => rows.filter((r) => r.rowId !== rowId));
  }

  updateLinea(rowId: string, patch: Partial<LineaFormRow>): void {
    this.lineas.update((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async onSubmit(): Promise<void> {
    const editingId = this.editingId();

    if (!editingId) {
      if (!this.clienteId()) {
        this.formError.set('Debés seleccionar un cliente.');
        return;
      }
      if (!this.numero().trim()) {
        this.formError.set('El número es obligatorio.');
        return;
      }
    }

    const filas = this.lineas();
    if (filas.length === 0) {
      this.formError.set('El presupuesto debe tener al menos una línea.');
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
      const precioUnitario = Number(fila.precioUnitario);
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        this.formError.set(`Línea ${n}: el precio unitario no puede ser negativo.`);
        return;
      }
      lineasRequest.push({
        tipo: fila.tipo,
        descripcion,
        cantidad,
        precioUnitario,
        tipoIva: fila.tipoIva,
        orden: n,
      });
    }

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      if (editingId) {
        const request: UpdatePresupuestoRequest = {
          fechaValidez: this.fechaValidez() || null,
          notas: this.notas().trim() || null,
          lineas: lineasRequest,
        };
        await this.presupuestosService.update(editingId, request);
      } else {
        const request: CreatePresupuestoRequest = {
          clienteId: this.clienteId(),
          numero: this.numero().trim(),
          fechaValidez: this.fechaValidez() || null,
          notas: this.notas().trim() || null,
          lineas: lineasRequest,
        };
        await this.presupuestosService.create(request);
      }
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private resetForm(): void {
    this.clienteId.set('');
    this.numero.set('');
    this.fechaValidez.set('');
    this.notas.set('');
    this.lineas.set([filaVacia()]);
  }
}
