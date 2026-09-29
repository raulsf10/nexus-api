import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { UsuarioJwtInterface } from '../interfaces/usuario-jwt.interface';
import { LoggerService } from '../logger/logger.service';

const METODOS_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class LogEscrituraInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const peticion = contexto.switchToHttp().getRequest<Request & { user?: UsuarioJwtInterface }>();
    const metodo = peticion.method.toUpperCase();

    if (!METODOS_ESCRITURA.has(metodo)) {
      return next.handle();
    }

    const ruta = peticion.url;
    const usuario = peticion.user?.usuario;
    const payload = ruta.split('?')[0].endsWith('/notificaciones-carnet/personalizados')
      ? undefined
      : ((peticion.body ?? undefined) as Record<string, unknown> | undefined);

    return next.handle().pipe(
      tap(() => {
        this.logger.escritura(`${metodo} ${ruta}`, ruta, usuario, payload);
      }),
    );
  }
}
