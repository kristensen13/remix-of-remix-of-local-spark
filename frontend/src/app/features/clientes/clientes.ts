import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesService } from './clientes.service';
import { ClienteFormModal } from './cliente-form-modal';
import { Cliente } from '../../core/models/cliente.models';

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, ClienteFormModal],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes implements OnInit {
  protected readonly clientesService = inject(ClientesService);

  @ViewChild(ClienteFormModal) modal!: ClienteFormModal;

  readonly searchTerm = signal('');

  readonly filteredClientes = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const clientes = this.clientesService.clientes();
    if (!term) {
      return clientes;
    }
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(term) || c.nif.toLowerCase().includes(term),
    );
  });

  ngOnInit(): void {
    void this.clientesService.load();
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  onEdit(cliente: Cliente): void {
    this.modal.openForEdit(cliente);
  }

  async onDelete(cliente: Cliente): Promise<void> {
    if (!confirm(`¿Eliminar a ${cliente.nombre}?`)) {
      return;
    }
    await this.clientesService.remove(cliente.id);
  }

  onSaved(): void {
    // No-op: ClientesService.create()/update() already reload the list themselves,
    // and the modal closes itself on success. Bound to (saved) only so the modal's
    // documented output has a consumer.
  }
}
