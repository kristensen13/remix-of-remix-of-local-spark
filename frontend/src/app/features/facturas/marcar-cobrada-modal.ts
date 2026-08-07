import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FacturasService } from './facturas.service';

function hoyLocal(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-marcar-cobrada-modal',
  imports: [FormsModule],
  templateUrl: './marcar-cobrada-modal.html',
  styleUrl: './marcar-cobrada-modal.css',
})
export class MarcarCobradaModal {
  private readonly facturasService = inject(FacturasService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly facturaId = signal<string | null>(null);
  readonly fechaCobro = signal('');

  open(facturaId: string): void {
    this.facturaId.set(facturaId);
    this.fechaCobro.set(hoyLocal());
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const facturaId = this.facturaId();
    if (!facturaId) {
      return;
    }
    if (!this.fechaCobro()) {
      this.formError.set('La fecha de cobro es obligatoria.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    await this.facturasService.marcarCobrada(facturaId, { fechaCobro: `${this.fechaCobro()}T00:00:00Z` });
    this.isSaving.set(false);

    const error = this.facturasService.errorMessage();
    if (error) {
      this.formError.set(error);
      return;
    }
    this.dialogEl.nativeElement.close();
  }
}
