export interface DatosPlantillaCarnet {
  tipo: 'asignacion' | 'eliminacion' | 'frecuencia' | 'aviso-inicial';
  idPosicion: number;
  usuarioAsignado: string | null;
  correoAsignado: string | null;
  informes: Array<{
    idInforme: number;
    nombre: string;
    frecuencia: string | null;
    estatusInstalacion: string | null;
    frecuenciaAnterior?: string | null;
  }>;
}
