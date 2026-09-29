export interface ReglaExcepcionCarnet {
  idPosicion: number | null;
  idInforme: number;
}

export interface ExcepcionCarnetEntidad extends ReglaExcepcionCarnet {
  idExcepcion: number;
  comentario: string | null;
  usuarioCreacion: string;
  fechaCreacion: string;
  usuarioActualizacion: string | null;
  fechaActualizacion: string | null;
}

export interface ResultadoExcepcionesCarnet {
  total: number;
  pagina: number;
  tamanioPagina: number;
  registros: ExcepcionCarnetEntidad[];
}
