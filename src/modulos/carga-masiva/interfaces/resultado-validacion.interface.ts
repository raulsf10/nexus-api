import { CodigoErrorFila } from '../enums/codigo-error-fila.enum';
import { OperacionCarga } from '../enums/operacion-carga.enum';

export type EstadoFila = 'valido' | 'error' | 'informativo';

export type CampoFila = 'idPosicion' | 'idInforme' | 'frecuencia' | 'general';

export interface ErrorFila {
  campo: CampoFila;
  codigo: CodigoErrorFila;
  mensaje: string;
}

export interface FilaValidada {
  fila: number;
  idPosicion: number | null;
  idInforme: number | null;
  frecuencia: string | null;
  estado: EstadoFila;
  errores: ErrorFila[];
  nombrePosicion: string | null;
  nombreInforme: string | null;
}

export interface ResultadoValidacion {
  operacion: OperacionCarga;
  totalFilas: number;
  filasValidas: number;
  filasInformativas: number;
  filasConError: number;
  filas: FilaValidada[];
}
