import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfiguracionService } from '../../../configuracion/configuracion.service';
import { UsuarioJwtInterface } from '../../../comun/interfaces/usuario-jwt.interface';

interface PayloadJwt {
  usuario: string;
  modulos: string[];
  skEmpleado?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtEstrategia extends PassportStrategy(Strategy, 'jwt') {
  constructor(configuracion: ConfiguracionService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configuracion.obtenerJwt().secreto,
    });
  }

  async validate(payload: PayloadJwt): Promise<UsuarioJwtInterface> {
    return {
      usuario: payload.usuario,
      modulos: payload.modulos ?? [],
      skEmpleado: payload.skEmpleado,
    };
  }
}
