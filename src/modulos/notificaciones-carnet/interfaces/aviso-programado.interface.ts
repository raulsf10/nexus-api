export interface ReglaCorreoCarnet {
  idInforme: number;
  nombreInforme: string;
  correoInicial: string | null;
  diasHabiles: number;
  activa: boolean;
  usuarioActualizacion: string;
  fechaActualizacion: Date;
}

export interface AvisoProgramadoCarnet {
  idAviso: string;
  idPosicion: number;
  correoInicial: string | null;
  diasHabiles: number;
  slaHoras: number | null;
  slaMinutos: number | null;
  zonaHoraria: string;
  usuario: string;
  origen: 'Manual' | 'Carga masiva';
  estado:
    | 'PREPARADO'
    | 'INICIAL_SLA'
    | 'USUARIO_SLA'
    | 'ACTIVACION'
    | 'INICIAL'
    | 'USUARIO'
    | 'ENVIADO'
    | 'CANCELADO';
  fechaInicial: Date | null;
  fechaProgramada: Date | null;
  fechaCorreoFinal: Date | null;
  destinatarioFinal: string | null;
  bloqueo: string;
}

export interface InformePendienteCarnet {
  idInforme: number;
  idCarnet: string | null;
}
