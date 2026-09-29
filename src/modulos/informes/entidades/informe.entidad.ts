export interface InformeEntidad {
  skVeo: number;
  nombre: string;
}

export interface InformeAsignadoEntidad {
  fkVeo: number;
  nombre: string;
  activo: number;
  frecuencia: string | null;
  estatusInstalacion: string | null;
}
