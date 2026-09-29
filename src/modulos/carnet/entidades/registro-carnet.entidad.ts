export interface RegistroCarnetEntidad {
  empresa: string | null;
  direccion: string | null;
  idPosicion: number;
  numeroColaborador: number | null;
  puestoPlantilla: string | null;
  nombrePlantilla: string | null;
  idInforme: number;
  nombreInforme: string | null;
  categoriaPdi: string | null;
  frecuenciaUso: string | null;
  folioJtrac: string | null;
  nombreIndicador: string | null;
  fechaAsignacionIndicador: string | null;
  estatusInstalacion: string | null;
  fechaAsignacion: string | null;
}

export interface ResultadoConsultaCarnet {
  total: number;
  pagina: number;
  tamanioPagina: number;
  registros: RegistroCarnetEntidad[];
}
