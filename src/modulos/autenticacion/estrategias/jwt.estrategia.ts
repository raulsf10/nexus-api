import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfiguracionService } from '../../../configuracion/configuracion.service';
import { UsuarioJwtInterface } from '../../../comun/interfaces/usuario-jwt.interface';
import { AutenticacionRepository } from '../autenticacion.repository';

interface PayloadJwt {
  usuario: string;
  modulos: string[];
  skEmpleado?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtEstrategia extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configuracion: ConfiguracionService,
    private readonly repositorio: AutenticacionRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configuracion.obtenerJwt().secreto,
    });
  }

  async validate(payload: PayloadJwt): Promise<UsuarioJwtInterface> {
    const modulos = await this.repositorio.obtenerModulosPorUsuario(payload.usuario);
    if (!modulos.length)
      throw new UnauthorizedException('El usuario ya no tiene permisos de acceso.');
    return {
      usuario: payload.usuario,
      modulos,
      skEmpleado: payload.skEmpleado,
    };
  }
}
