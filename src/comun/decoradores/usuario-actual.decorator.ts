import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { UsuarioJwtInterface } from '../interfaces/usuario-jwt.interface';

export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioJwtInterface | undefined => {
    const peticion = ctx.switchToHttp().getRequest<Request & { user?: UsuarioJwtInterface }>();
    return peticion.user;
  },
);
