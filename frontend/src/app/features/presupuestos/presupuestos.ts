import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PresupuestosService } from './presupuestos.service';
import { ClientesService } from '../clientes/clientes.service';
import { PresupuestoFormModal } from './presupuesto-form-modal';
import {
  EstadoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  PresupuestoSummary,
} from '../../core/models/presupuesto.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-presupuestos',
  imports: [PresupuestoFormModal],
  templateUrl: './presupuestos.html',
  styleUrl: './presupuestos.css',
})
export class Presupuestos implements OnInit {
  protected readonly presupuestosService = inject(PresupuestosService);
  protected readonly clientesService = inject(ClientesService);
  protected readonly EstadoPresupuesto = EstadoPresupuesto;
  protected readonly ESTADO_PRESUPUESTO_LABELS = ESTADO_PRESUPUESTO_LABELS;

  @ViewChild(PresupuestoFormModal) modal!: PresupuestoFormModal;

  ngOnInit(): void {
    void this.presupuestosService.load();
    void this.clientesService.load();
  }

  nombreCliente(clienteId: string): string {
    return this.clientesService.clientes().find((c) => c.id === clienteId)?.nombre ?? '—';
  }

  formatFecha(iso: string): string {
    return iso.slice(0, 10);
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  async onEdit(p: PresupuestoSummary): Promise<void> {
    try {
      const detalle = await this.presupuestosService.getById(p.id);
      this.modal.openForEdit(detalle);
    } catch (error) {
      this.presupuestosService.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async onEnviar(p: PresupuestoSummary): Promise<void> {
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Enviado);
  }

  async onAceptar(p: PresupuestoSummary): Promise<void> {
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Aceptado);
  }

  async onRechazar(p: PresupuestoSummary): Promise<void> {
    if (!confirm(`¿Rechazar el presupuesto ${p.numero}?`)) {
      return;
    }
    await this.presupuestosService.cambiarEstado(p.id, EstadoPresupuesto.Rechazado);
  }

  onSaved(): void {
    // No-op: PresupuestosService.create()/update() already reload the list
    // themselves, and the modal closes itself on success. Bound to (saved)
    // only so the modal's documented output has a consumer.
  }
}
