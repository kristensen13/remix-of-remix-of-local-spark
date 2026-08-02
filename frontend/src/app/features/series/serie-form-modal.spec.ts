import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { SerieFormModal } from './serie-form-modal';
import { SeriesService } from './series.service';
import { Serie } from '../../core/models/serie.models';

const serie1: Serie = {
  id: 's1',
  codigo: 'A',
  descripcion: 'Serie general',
  ultimoNumero: 12,
  anio: 2025,
  esRectificativa: false,
};

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('SerieFormModal', () => {
  let component: SerieFormModal;
  let seriesServiceStub: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    seriesServiceStub = {
      create: vi.fn().mockResolvedValue(serie1),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SeriesService, useValue: seriesServiceStub }],
    });

    component = TestBed.createComponent(SerieFormModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('openForCreate() resets the form to defaults (año = current year) and shows the dialog', () => {
    component.codigo.set('leftover');
    component.anio.set(1999);
    component.openForCreate();

    expect(component.codigo()).toBe('');
    expect(component.descripcion()).toBe('');
    expect(component.anio()).toBe(new Date().getFullYear());
    expect(component.esRectificativa()).toBe(false);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when código is blank', async () => {
    component.openForCreate();
    component.codigo.set('   ');

    await component.onSubmit();

    expect(component.formError()).toBe('El código de serie es obligatorio.');
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when año is outside 2000-2100', async () => {
    component.openForCreate();
    component.codigo.set('A');
    component.anio.set(99999);

    await component.onSubmit();

    expect(component.formError()).toBe('El año debe ser un número entre 2000 y 2100.');
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when año is null (input cleared)', async () => {
    component.openForCreate();
    component.codigo.set('A');
    component.anio.set(null as unknown as number);

    await component.onSubmit();

    expect(component.formError()).toBe('El año debe ser un número entre 2000 y 2100.');
    expect(seriesServiceStub.create).not.toHaveBeenCalled();
  });

  it('onSubmit() calls create(), closes the dialog, and emits saved', async () => {
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);
    component.openForCreate();
    component.codigo.set('A');
    component.descripcion.set('Serie general');
    component.anio.set(2026);

    await component.onSubmit();

    expect(seriesServiceStub.create).toHaveBeenCalledWith({
      codigo: 'A',
      descripcion: 'Serie general',
      anio: 2026,
      esRectificativa: false,
    });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('onSubmit() sends null descripcion when left blank', async () => {
    component.openForCreate();
    component.codigo.set('A');

    await component.onSubmit();

    expect(seriesServiceStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: null }),
    );
  });

  it('onSubmit() sets formError and keeps the dialog open on backend failure', async () => {
    seriesServiceStub.create.mockRejectedValue({
      error: { message: 'Ya existe una serie con ese código para ese año.' },
    });
    component.openForCreate();
    component.codigo.set('A');

    await component.onSubmit();

    expect(component.formError()).toBe('Ya existe una serie con ese código para ese año.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });
});
