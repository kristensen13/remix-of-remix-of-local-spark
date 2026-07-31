import { Service, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cliente, CreateClienteRequest, UpdateClienteRequest } from '../../core/models/cliente.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Service()
export class ClientesService {
  private readonly http = inject(HttpClient);

  readonly clientes = signal<Cliente[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const clientes = await firstValueFrom(this.http.get<Cliente[]>('/api/clientes'));
      this.clientes.set(clientes);
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(request: CreateClienteRequest): Promise<Cliente> {
    const cliente = await firstValueFrom(this.http.post<Cliente>('/api/clientes', request));
    await this.load();
    return cliente;
  }

  async update(id: string, request: UpdateClienteRequest): Promise<Cliente> {
    const cliente = await firstValueFrom(this.http.put<Cliente>(`/api/clientes/${id}`, request));
    await this.load();
    return cliente;
  }

  async remove(id: string): Promise<void> {
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.http.delete<void>(`/api/clientes/${id}`));
      await this.load();
    } catch (error) {
      this.errorMessage.set(extractErrorMessage(error as HttpErrorResponse));
    }
  }
}
