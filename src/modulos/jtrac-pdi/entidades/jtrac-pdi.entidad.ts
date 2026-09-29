export interface RelacionJtracPdi {
  idRelacion: number;
  idInforme: number;
  nombreInforme: string;
  folioJtrac: string;
  usuarioCreacion: string;
  fechaCreacion: string;
  usuarioActualizacion: string | null;
  fechaActualizacion: string | null;
}

export interface FilaReporteJtracPdi {
  empresa: string | null;
  direccion: string | null;
  idPosicion: number;
  numeroColaborador: string | null;
  nombrePlantilla: string | null;
  puestoPlantilla: string | null;
  categoria: 'RPD';
  idInforme: number;
  nombreInforme: string;
  frecuencia: string | null;
  idRelacion: number | null;
  folioJtrac: string | null;
  indicador: string | null;
  fechaRelacion: string | null;
  usuarioRelacion: string | null;
}
