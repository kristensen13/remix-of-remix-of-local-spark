import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { MarcarCobradaModal } from './marcar-cobrada-modal';
import { FacturasService } from './facturas.service';

function stubDialog(): ElementRef<HTMLDialogElement> {
  return { nativeElement: { showModal: vi.fn(), close: vi.fn() } } as unknown as ElementRef<HTMLDialogElement>;
}

describe('MarcarCobradaModal', () => {
  let component: MarcarCobradaModal;
  let facturasServiceStub: {
    marcarCobrada: ReturnType<typeof vi.fn>;
    errorMessage: ReturnType<typeof signal<string | null>>;
  };

  beforeEach(() => {
    facturasServiceStub = {
      marcarCobrada: vi.fn().mockResolvedValue(undefined),
      errorMessage: signal<string | null>(null),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: FacturasService, useValue: facturasServiceStub }],
    });

    component = TestBed.createComponent(MarcarCobradaModal).componentInstance;
    component.dialogEl = stubDialog();
  });

  it('open() defaults fechaCobro to today and shows the dialog', () => {
    component.open('f1');
    expect(component.facturaId()).toBe('f1');
    expect(component.fechaCobro()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(component.dialogEl.nativeElement.showModal).toHaveBeenCalled();
  });

  it('cancel() closes the dialog without calling the service', () => {
    component.cancel();
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });

  it('onSubmit() sends fechaCobro as a UTC instant and closes the dialog on success', async () => {
    component.open('f1');
    component.fechaCobro.set('2026-08-15');

    await component.onSubmit();

    expect(facturasServiceStub.marcarCobrada).toHaveBeenCalledWith('f1', { fechaCobro: '2026-08-15T00:00:00Z' });
    expect(component.dialogEl.nativeElement.close).toHaveBeenCalled();
  });

  it('onSubmit() shows the service errorMessage and keeps the dialog open on failure', async () => {
    facturasServiceStub.errorMessage.set('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    component.open('f1');

    await component.onSubmit();

    expect(component.formError()).toBe('Solo se pueden marcar como cobradas facturas en estado Emitida.');
    expect(component.dialogEl.nativeElement.close).not.toHaveBeenCalled();
  });

  it('onSubmit() blocks and sets formError when fechaCobro is cleared', async () => {
    component.open('f1');
    component.fechaCobro.set('');

    await component.onSubmit();

    expect(component.formError()).toBe('La fecha de cobro es obligatoria.');
    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });

  it('onSubmit() does not call service when facturaId is null (before open)', async () => {
    await component.onSubmit();

    expect(facturasServiceStub.marcarCobrada).not.toHaveBeenCalled();
  });
});
