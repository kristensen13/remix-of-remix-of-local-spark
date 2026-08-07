export enum TipoLinea {
  ServicioPorHoras,
  ServicioPrecioFijo,
  Suscripcion,
  Producto,
}

export enum TipoIva {
  General21,
  Reducido10,
  Superreducido4,
  Exento,
}

export enum EstadoPresupuesto {
  Borrador,
  Enviado,
  Aceptado,
  Rechazado,
  Caducado,
}

export const TIPO_LINEA_LABELS: Record<TipoLinea, string> = {
  [TipoLinea.ServicioPorHoras]: 'Servicio por horas',
  [TipoLinea.ServicioPrecioFijo]: 'Servicio a precio fijo',
  [TipoLinea.Suscripcion]: 'Suscripción',
  [TipoLinea.Producto]: 'Producto',
};

export const TIPO_IVA_LABELS: Record<TipoIva, string> = {
  [TipoIva.General21]: 'IVA general (21%)',
  [TipoIva.Reducido10]: 'IVA reducido (10%)',
  [TipoIva.Superreducido4]: 'IVA superreducido (4%)',
  [TipoIva.Exento]: 'Exento de IVA',
};

export const TIPO_IVA_PORCENTAJE: Record<TipoIva, number> = {
  [TipoIva.General21]: 21,
  [TipoIva.Reducido10]: 10,
  [TipoIva.Superreducido4]: 4,
  [TipoIva.Exento]: 0,
};

export const ESTADO_PRESUPUESTO_LABELS: Record<EstadoPresupuesto, string> = {
  [EstadoPresupuesto.Borrador]: 'Borrador',
  [EstadoPresupuesto.Enviado]: 'Enviado',
  [EstadoPresupuesto.Aceptado]: 'Aceptado',
  [EstadoPresupuesto.Rechazado]: 'Rechazado',
  [EstadoPresupuesto.Caducado]: 'Caducado',
};

export interface LineaPresupuesto {
  id: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface Presupuesto {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  fechaValidez: string | null;
  notas: string | null;
  facturaId: string | null;
  lineas: LineaPresupuesto[];
  createdAt: string;
  updatedAt: string;
}

export interface PresupuestoSummary {
  id: string;
  clienteId: string;
  numero: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  numeroLineas: number;
  facturaId: string | null;
}

export interface LineaPresupuestoRequest {
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface CreatePresupuestoRequest {
  clienteId: string;
  numero: string;
  fechaValidez: string | null;
  notas: string | null;
  lineas: LineaPresupuestoRequest[];
}

export interface UpdatePresupuestoRequest {
  fechaValidez: string | null;
  notas: string | null;
  lineas: LineaPresupuestoRequest[];
}
