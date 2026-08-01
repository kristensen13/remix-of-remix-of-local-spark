import { Component, ElementRef, EventEmitter, Output, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ClientesService } from './clientes.service';
import { Cliente, CreateClienteRequest } from '../../core/models/cliente.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-cliente-form-modal',
  imports: [FormsModule],
  templateUrl: './cliente-form-modal.html',
  styleUrl: './cliente-form-modal.css',
})
export class ClienteFormModal {
  private readonly clientesService = inject(ClientesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  @Output() saved = new EventEmitter<void>();

  readonly editingId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly nombre = signal('');
  readonly nif = signal('');
  readonly direccion = signal('');
  readonly codigoPostal = signal('');
  readonly ciudad = signal('');
  readonly provincia = signal('');
  readonly pais = signal('España');
  readonly email = signal('');
  readonly telefono = signal('');
  readonly esAutonomoOProfesional = signal(false);

  openForCreate(): void {
    this.editingId.set(null);
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  openForEdit(cliente: Cliente): void {
    this.editingId.set(cliente.id);
    this.nombre.set(cliente.nombre);
    this.nif.set(cliente.nif);
    this.direccion.set(cliente.direccion);
    this.codigoPostal.set(cliente.codigoPostal ?? '');
    this.ciudad.set(cliente.ciudad ?? '');
    this.provincia.set(cliente.provincia ?? '');
    this.pais.set(cliente.pais);
    this.email.set(cliente.email ?? '');
    this.telefono.set(cliente.telefono ?? '');
    this.esAutonomoOProfesional.set(cliente.esAutonomoOProfesional);
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const nombre = this.nombre().trim();
    const nif = this.nif().trim();
    const direccion = this.direccion().trim();

    if (!nombre || !nif || !direccion) {
      this.formError.set('Nombre, NIF y Dirección son obligatorios.');
      return;
    }

    const request: CreateClienteRequest = {
      nombre,
      nif,
      direccion,
      codigoPostal: this.codigoPostal().trim() || null,
      ciudad: this.ciudad().trim() || null,
      provincia: this.provincia().trim() || null,
      pais: this.pais().trim() || null,
      email: this.email().trim() || null,
      telefono: this.telefono().trim() || null,
      esAutonomoOProfesional: this.esAutonomoOProfesional(),
    };

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      const id = this.editingId();
      if (id) {
        await this.clientesService.update(id, request);
      } else {
        await this.clientesService.create(request);
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
    this.nombre.set('');
    this.nif.set('');
    this.direccion.set('');
    this.codigoPostal.set('');
    this.ciudad.set('');
    this.provincia.set('');
    this.pais.set('España');
    this.email.set('');
    this.telefono.set('');
    this.esAutonomoOProfesional.set(false);
  }
}
