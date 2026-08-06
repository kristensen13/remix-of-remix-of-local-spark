import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CreateFacturaRequest,
  Factura,
  FacturaSummary,
  MarcarCobradaRequest,
  RectificarFacturaRequest,
} from '../../core/models/factura.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class FacturasService {
  private readonly http = inject(HttpClient);
  // Se recuerda el último filtro de cliente para que las mutaciones (create,
  // marcarCobrada, anular, rectificar) recarguen sin resetear un filtro activo.
  private currentClienteId: string | undefined;

  readonly facturas = signal<FacturaSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(clienteId?: string): Promise<void> {
    this.currentClienteId = clienteId;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const url = clienteId ? `/api/facturas?clienteId=${clienteId}` : '/api/facturas';
      const facturas = await firstValueFrom(this.http.get<FacturaSummary[]>(url));
      this.facturas.set(facturas);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  private reload(): Promise<void> {
    return this.load(this.currentClienteId);
  }

  async getById(id: string): Promise<Factura> {
    return firstValueFrom(this.http.get<Factura>(`/api/facturas/${id}`));
  }

  async create(request: CreateFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(this.http.post<Factura>('/api/facturas', request));
    await this.reload();
    return factura;
  }

  async marcarCobrada(id: string, request: MarcarCobradaRequest): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/facturas/${id}/marcar-cobrada`, request));
      await this.reload();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async anular(id: string): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/facturas/${id}/anular`, {}));
      await this.reload();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }

  async rectificar(id: string, request: RectificarFacturaRequest): Promise<Factura> {
    const factura = await firstValueFrom(this.http.post<Factura>(`/api/facturas/${id}/rectificar`, request));
    await this.reload();
    return factura;
  }
}
