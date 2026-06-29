export type TipoParametroSp = 'numero' | 'texto';
export type DireccionParametroSp = 'in' | 'out';

export interface ParametroSpInterface {
  nombre: string;
  valor: unknown;
  tipo: TipoParametroSp;
  direccion?: DireccionParametroSp;
}
