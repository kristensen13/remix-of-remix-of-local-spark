import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CreatePresupuestoRequest,
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoSummary,
  UpdatePresupuestoRequest,
} from '../../core/models/presupuesto.models';
import { ConvertirAFacturaRequest, Factura } from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class PresupuestosService {
  private readonly http = inject(HttpClient);

  readonly presupuestos = signal<PresupuestoSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const presupuestos = await firstValueFrom(this.http.get<PresupuestoSummary[]>('/api/presupuestos'));
      this.presupuestos.set(presupuestos);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreatePresupuestoRequest): Promise<Presupuesto> {
    const presupuesto = await firstValueFrom(this.http.post<Presupuesto>('/api/presupuestos', request));
    await this.load();
    return presupuesto;
  }

  async update(id: string, request: UpdatePresupuestoRequest): Promise<Presupuesto> {
    const presupuesto = await firstValueFrom(this.http.put<Presupuesto>(`/api/presupuestos/${id}`, request));
    await this.load();
    return presupuesto;
  }

  async cambiarEstado(id: string, estado: EstadoPresupuesto): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/presupuestos/${id}/estado`, { estado }));
      await this.load();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async getById(id: string): Promise<Presupuesto> {
    return firstValueFrom(this.http.get<Presupuesto>(`/api/presupuestos/${id}`));
  }

  async convertirAFactura(id: string, request: ConvertirAFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(
      this.http.post<Factura>(`/api/presupuestos/${id}/convertir-a-factura`, request),
    );
    await this.load();
    return factura;
  }
}
