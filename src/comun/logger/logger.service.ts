import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

type ContextoLog = Record<string, unknown> | undefined;

@Injectable()
export class LoggerService {
  constructor(private readonly pino: PinoLogger) {
    this.pino.setContext('NEXUS');
  }

  info(mensaje: string, contexto?: ContextoLog): void {
    this.pino.info(contexto ?? {}, mensaje);
  }

  advertencia(mensaje: string, contexto?: ContextoLog): void {
    this.pino.warn(contexto ?? {}, mensaje);
  }

  error(mensaje: string, error?: unknown, contexto?: ContextoLog): void {
    const datos: Record<string, unknown> = { ...(contexto ?? {}) };
    if (error instanceof Error) {
      datos['error'] = { nombre: error.name, mensaje: error.message, stack: error.stack };
    } else if (error !== undefined) {
      datos['error'] = error;
    }
    this.pino.error(datos, mensaje);
  }

  autenticacion(mensaje: string, usuario: string, contexto?: ContextoLog): void {
    this.pino.info({ tipo: 'autenticacion', usuario, ...(contexto ?? {}) }, mensaje);
  }

  escritura(
    operacion: string,
    tabla: string,
    usuario: string | undefined,
    payload?: Record<string, unknown>,
  ): void {
    this.pino.info(
      {
        tipo: 'escritura',
        operacion,
        tabla,
        usuario: usuario ?? 'anonimo',
        payload: this.sanitizarPayload(payload),
      },
      `Escritura: ${operacion} ${tabla}`,
    );
  }

  private sanitizarPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!payload) return undefined;
    const clavesSensibles = ['contrasena', 'contraseña', 'password', 'secret', 'token'];
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(payload)) {
      limpio[clave] = clavesSensibles.includes(clave.toLowerCase()) ? '[REDACTADO]' : valor;
    }
    return limpio;
  }
}
