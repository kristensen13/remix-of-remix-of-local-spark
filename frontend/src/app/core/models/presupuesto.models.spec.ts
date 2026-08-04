import {
  EstadoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  TIPO_IVA_LABELS,
  TIPO_IVA_PORCENTAJE,
  TIPO_LINEA_LABELS,
  TipoIva,
  TipoLinea,
} from './presupuesto.models';

function numericValues<T extends Record<string, string | number>>(enumObj: T): number[] {
  return Object.values(enumObj).filter((v): v is number => typeof v === 'number');
}

describe('presupuesto.models label maps', () => {
  it('TIPO_LINEA_LABELS has a non-empty entry for every TipoLinea value', () => {
    for (const value of numericValues(TipoLinea)) {
      expect(TIPO_LINEA_LABELS[value as TipoLinea]).toBeTruthy();
    }
  });

  it('TIPO_IVA_LABELS and TIPO_IVA_PORCENTAJE have an entry for every TipoIva value', () => {
    for (const value of numericValues(TipoIva)) {
      expect(TIPO_IVA_LABELS[value as TipoIva]).toBeTruthy();
      expect(TIPO_IVA_PORCENTAJE[value as TipoIva]).toBeDefined();
    }
  });

  it('ESTADO_PRESUPUESTO_LABELS has a non-empty entry for every EstadoPresupuesto value', () => {
    for (const value of numericValues(EstadoPresupuesto)) {
      expect(ESTADO_PRESUPUESTO_LABELS[value as EstadoPresupuesto]).toBeTruthy();
    }
  });
});
