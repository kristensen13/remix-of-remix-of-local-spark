import { LineaPresupuestoRequest, TipoIva, TipoLinea } from './presupuesto.models';

export enum EstadoFactura {
  Emitida,
  Cobrada,
  Anulada,
  Rectificada,
}

export const ESTADO_FACTURA_LABELS: Record<EstadoFactura, string> = {
  [EstadoFactura.Emitida]: 'Emitida',
  [EstadoFactura.Cobrada]: 'Cobrada',
  [EstadoFactura.Anulada]: 'Anulada',
  [EstadoFactura.Rectificada]: 'Rectificada',
};

export interface LineaFactura {
  id: string;
  tipo: TipoLinea;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIva;
  orden: number;
}

export interface Factura {
  id: string;
  clienteId: string;
  serieId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  fechaVencimiento: string | null;
  fechaCobro: string | null;
  porcentajeRetencionIrpf: number | null;
  baseImponible: number;
  totalIva: number;
  totalRetencion: number;
  total: number;
  presupuestoOrigenId: string | null;
  facturaRectificadaId: string | null;
  pdfUrl: string | null;
  lineas: LineaFactura[];
  createdAt: string;
}

export interface FacturaSummary {
  id: string;
  clienteId: string;
  numeroCompleto: string;
  estado: EstadoFactura;
  fechaEmision: string;
  total: number;
}

export interface CreateFacturaRequest {
  clienteId: string;
  serieId: string;
  fechaVencimiento: string | null;
  porcentajeRetencionIrpf: number | null;
  lineas: LineaPresupuestoRequest[];
}

export interface MarcarCobradaRequest {
  fechaCobro: string;
}

export interface RectificarFacturaRequest {
  serieRectificativaId: string;
  motivo: string;
  lineasCorregidas: LineaPresupuestoRequest[];
}

export interface ConvertirAFacturaRequest {
  serieId: string;
  porcentajeRetencionIrpf: number | null;
}
