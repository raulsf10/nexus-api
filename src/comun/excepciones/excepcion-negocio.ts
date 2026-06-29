import { CodigosError } from '../enums/codigos-error.enum';

export class ExcepcionNegocio extends Error {
  public readonly mensaje: string;

  constructor(
    public readonly codigo: CodigosError,
    mensaje: string,
    public readonly estadoHttp: number = 400,
    public readonly detalles?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ExcepcionNegocio';
    this.mensaje = mensaje;
  }
}
