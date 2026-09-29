export type TipoCambioCarnetCorreo = 'asignacion' | 'eliminacion';

export interface CambioCarnetCorreo {
  idPosicion: number;
  idInforme: number;
  tipo: TipoCambioCarnetCorreo;
  usuario: string;
  origen: 'Manual' | 'Carga masiva';
  activacionDiferida?: boolean;
  idCarnet?: string;
}
