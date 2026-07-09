export interface ResultadoFilaProceso {
  idPosicion: number;
  idInforme: number;
  exitoso: boolean;
  mensaje: string;
}

export interface ResultadoProceso {
  total: number;
  exitosas: number;
  fallidas: number;
  resultados: ResultadoFilaProceso[];
}
