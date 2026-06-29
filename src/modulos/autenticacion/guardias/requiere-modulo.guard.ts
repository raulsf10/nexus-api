import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CLAVE_REQUIERE_MODULO } from '../../../comun/decoradores/requiere-modulo.decorator';
import { CodigosError } from '../../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../../comun/interfaces/usuario-jwt.interface';

@Injectable()
export class RequiereModuloGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const moduloRequerido = this.reflector.getAllAndOverride<string | undefined>(
      CLAVE_REQUIERE_MODULO,
      [context.getHandler(), context.getClass()],
    );
    if (!moduloRequerido) return true;

    const peticion = context
      .switchToHttp()
      .getRequest<Request & { user?: UsuarioJwtInterface }>();
    const usuario = peticion.user;
    if (!usuario) {
      throw new ExcepcionNegocio(CodigosError.NO_AUTENTICADO, 'Sesión requerida.', 401);
    }
    if (!usuario.modulos.includes(moduloRequerido)) {
      throw new ExcepcionNegocio(
        CodigosError.NO_AUTORIZADO,
        `No tiene acceso al módulo: ${moduloRequerido}`,
        403,
      );
    }
    return true;
  }
}
