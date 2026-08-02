import { Component, ElementRef, ViewChild, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SeriesService } from './series.service';
import { CreateSerieRequest } from '../../core/models/serie.models';
import { extractErrorMessage } from '../../core/http-error.util';

@Component({
  selector: 'app-serie-form-modal',
  imports: [FormsModule],
  templateUrl: './serie-form-modal.html',
  styleUrl: './serie-form-modal.css',
})
export class SerieFormModal {
  private readonly seriesService = inject(SeriesService);

  @ViewChild('dialogEl') dialogEl!: ElementRef<HTMLDialogElement>;
  readonly saved = output<void>();

  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly codigo = signal('');
  readonly descripcion = signal('');
  readonly anio = signal(new Date().getFullYear());
  readonly esRectificativa = signal(false);

  openForCreate(): void {
    this.resetForm();
    this.formError.set(null);
    this.dialogEl.nativeElement.showModal();
  }

  cancel(): void {
    this.dialogEl.nativeElement.close();
  }

  async onSubmit(): Promise<void> {
    const codigo = this.codigo().trim();

    if (!codigo) {
      this.formError.set('El código de serie es obligatorio.');
      return;
    }

    const anio = Number(this.anio());
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      this.formError.set('El año debe ser un número entre 2000 y 2100.');
      return;
    }

    const request: CreateSerieRequest = {
      codigo,
      descripcion: this.descripcion().trim() || null,
      anio,
      esRectificativa: this.esRectificativa(),
    };

    this.isSaving.set(true);
    this.formError.set(null);
    try {
      await this.seriesService.create(request);
      this.dialogEl.nativeElement.close();
      this.saved.emit();
    } catch (error) {
      this.formError.set(extractErrorMessage(error as HttpErrorResponse));
    } finally {
      this.isSaving.set(false);
    }
  }

  private resetForm(): void {
    this.codigo.set('');
    this.descripcion.set('');
    this.anio.set(new Date().getFullYear());
    this.esRectificativa.set(false);
  }
}
