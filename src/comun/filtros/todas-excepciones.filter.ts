import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CodigosError } from '../enums/codigos-error.enum';
import { ExcepcionNegocio } from '../excepciones/excepcion-negocio';
import { LoggerService } from '../logger/logger.service';

interface CuerpoRespuestaError {
  exitoso: false;
  codigo: string;
  mensaje: string;
  detalles?: Record<string, unknown>;
}

@Catch()
export class TodasExcepcionesFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const peticion = contexto.getRequest<Request>();

    if (excepcion instanceof ExcepcionNegocio) {
      const cuerpo: CuerpoRespuestaError = {
        exitoso: false,
        codigo: excepcion.codigo,
        mensaje: excepcion.mensaje,
        detalles: excepcion.detalles,
      };
      this.logger.info(`ExcepcionNegocio en ${peticion.method} ${peticion.url}`, {
        codigo: excepcion.codigo,
        mensaje: excepcion.mensaje,
      });
      respuesta.status(excepcion.estadoHttp).json(cuerpo);
      return;
    }

    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      const respuestaExcepcion = excepcion.getResponse();
      const { codigo, mensaje, detalles } = this.normalizarHttpException(
        respuestaExcepcion,
        estado,
      );
      const cuerpo: CuerpoRespuestaError = { exitoso: false, codigo, mensaje, detalles };
      respuesta.status(estado).json(cuerpo);
      return;
    }

    const error = excepcion instanceof Error ? excepcion : new Error(String(excepcion));
    this.logger.error(`Error no controlado en ${peticion.method} ${peticion.url}`, error, {
      ruta: peticion.url,
      metodo: peticion.method,
    });

    const cuerpo: CuerpoRespuestaError = {
      exitoso: false,
      codigo: CodigosError.ERROR_INTERNO,
      mensaje: 'Ocurrió un error interno. Contacte al administrador.',
    };
    respuesta.status(HttpStatus.INTERNAL_SERVER_ERROR).json(cuerpo);
  }

  private normalizarHttpException(
    respuestaExcepcion: string | object,
    estado: number,
  ): { codigo: string; mensaje: string; detalles?: Record<string, unknown> } {
    if (typeof respuestaExcepcion === 'string') {
      return { codigo: this.mapearEstadoACodigo(estado), mensaje: respuestaExcepcion };
    }
    const objeto = respuestaExcepcion as Record<string, unknown>;
    const mensaje = (objeto['message'] as string | string[] | undefined) ?? 'Error de petición.';
    const mensajeFinal = Array.isArray(mensaje) ? mensaje.join('; ') : mensaje;
    const codigoRaw = objeto['error'] as string | undefined;
    return {
      codigo: codigoRaw ?? this.mapearEstadoACodigo(estado),
      mensaje: mensajeFinal,
      detalles: Array.isArray(mensaje) ? { errores: mensaje } : undefined,
    };
  }

  private mapearEstadoACodigo(estado: number): string {
    if (estado === HttpStatus.UNAUTHORIZED) return CodigosError.NO_AUTENTICADO;
    if (estado === HttpStatus.FORBIDDEN) return CodigosError.NO_AUTORIZADO;
    if (estado === HttpStatus.BAD_REQUEST) return CodigosError.VALIDACION;
    return CodigosError.ERROR_INTERNO;
  }
}
