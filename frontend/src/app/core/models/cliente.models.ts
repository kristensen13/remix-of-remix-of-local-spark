export interface Cliente {
  id: string;
  nombre: string;
  nif: string;
  direccion: string;
  codigoPostal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string;
  email: string | null;
  telefono: string | null;
  esAutonomoOProfesional: boolean;
  createdAt: string;
}

export interface ClienteFormValue {
  nombre: string;
  nif: string;
  direccion: string;
  codigoPostal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  email: string | null;
  telefono: string | null;
  esAutonomoOProfesional: boolean;
}

export type CreateClienteRequest = ClienteFormValue;
export type UpdateClienteRequest = ClienteFormValue;
