import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Publico } from '../../comun/decoradores/publico.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { AutenticacionService } from './autenticacion.service';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto';
import { RespuestaIniciarSesionDto } from './dto/respuesta-iniciar-sesion.dto';

@ApiTags('Autenticación')
@Controller('autenticacion')
export class AutenticacionController {
  constructor(private readonly servicio: AutenticacionService) {}

  @Publico()
  @Post('iniciar-sesion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión validando contra AD y dim_ci_admin.' })
  @ApiResponse({ status: 200, type: RespuestaIniciarSesionDto })
  @ApiResponse({ status: 401, description: 'Usuario o contraseña incorrectos.' })
  @ApiResponse({ status: 403, description: 'Usuario no autorizado para este sistema.' })
  @ApiResponse({ status: 503, description: 'Servicio de autenticación no disponible.' })
  async iniciarSesion(@Body() datos: IniciarSesionDto): Promise<RespuestaIniciarSesionDto> {
    return this.servicio.iniciarSesion(datos);
  }

  @Get('yo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario actual extraído del JWT.' })
  @ApiResponse({ status: 200, description: 'Datos del usuario en sesión.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
  obtenerUsuarioActual(@UsuarioActual() usuario: UsuarioJwtInterface): UsuarioJwtInterface {
    return usuario;
  }

  @Post('cerrar-sesion')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registra el cierre de sesión. El cliente debe borrar el token.' })
  @ApiResponse({ status: 200, description: 'Logout registrado.' })
  async cerrarSesion(
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<{ exitoso: true }> {
    await this.servicio.cerrarSesion(usuario.usuario);
    return { exitoso: true };
  }
}
