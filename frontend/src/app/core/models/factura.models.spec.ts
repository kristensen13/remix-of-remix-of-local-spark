import { EstadoFactura, ESTADO_FACTURA_LABELS } from './factura.models';

function numericValues<T extends Record<string, string | number>>(enumObj: T): number[] {
  return Object.values(enumObj).filter((v): v is number => typeof v === 'number');
}

describe('factura.models label maps', () => {
  it('ESTADO_FACTURA_LABELS has a non-empty entry for every EstadoFactura value', () => {
    for (const value of numericValues(EstadoFactura)) {
      expect(ESTADO_FACTURA_LABELS[value as EstadoFactura]).toBeTruthy();
    }
  });
});
