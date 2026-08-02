export interface Serie {
  id: string;
  codigo: string;
  descripcion: string | null;
  ultimoNumero: number;
  anio: number;
  esRectificativa: boolean;
}

export interface CreateSerieRequest {
  codigo: string;
  descripcion: string | null;
  anio: number;
  esRectificativa: boolean;
}
