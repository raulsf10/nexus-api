import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { AutenticacionRepository } from './autenticacion.repository';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto';
import { RespuestaIniciarSesionDto } from './dto/respuesta-iniciar-sesion.dto';
import { LdapService } from './ldap.service';

@Injectable()
export class AutenticacionService {
  constructor(
    private readonly ldap: LdapService,
    private readonly repositorio: AutenticacionRepository,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async iniciarSesion(datos: IniciarSesionDto): Promise<RespuestaIniciarSesionDto> {
    const usuario = datos.usuario.toLowerCase();

    await this.validarCredencialesAd(usuario, datos.contrasena);

    const modulos = await this.repositorio.obtenerModulosPorUsuario(usuario);
    if (modulos.length === 0) {
      this.logger.autenticacion('Login fallido: usuario no autorizado', usuario);
      throw new ExcepcionNegocio(
        CodigosError.NO_AUTORIZADO,
        'Usuario no autorizado para este sistema.',
        403,
      );
    }

    await this.repositorio.actualizarUltimoAcceso(usuario);

    const jwt = this.configuracion.obtenerJwt();
    const token = this.jwtService.sign({ usuario, modulos });

    this.logger.autenticacion('Login exitoso', usuario, { modulos: modulos.length });

    return {
      token,
      usuario,
      modulos,
      expiraEn: jwt.expiraEn,
    };
  }

  async cerrarSesion(usuario: string): Promise<void> {
    this.logger.autenticacion('Logout', usuario);
  }

  private async validarCredencialesAd(usuario: string, contrasena: string): Promise<void> {
    try {
      await this.ldap.autenticar(usuario, contrasena);
    } catch (error) {
      if (error instanceof ExcepcionNegocio) {
        if (error.codigo === CodigosError.CONTRASENA_INVALIDA) {
          this.logger.autenticacion('Login fallido: contraseña incorrecta', usuario);
        } else if (error.codigo === CodigosError.AD_NO_DISPONIBLE) {
          this.logger.autenticacion('Login fallido: AD no disponible', usuario, {
            error: error.detalles?.['detalle'] ?? error.mensaje,
          });
        }
      }
      throw error;
    }
  }
}
