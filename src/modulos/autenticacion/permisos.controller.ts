import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from './guardias/requiere-modulo.guard';
import { GuardarPermisosDto, UsuarioPermisosDto } from './dto/guardar-permisos.dto';
import { MODULO_ADMINISTRAR_PERMISOS } from './permisos.constantes';
import { PermisosService } from './permisos.service';
import { ConsultarUsuariosPermisosDto } from './dto/consultar-usuarios-permisos.dto';
import { GuardarPermisosPosicionDto } from './dto/permisos-posicion.dto';

@ApiTags('Permisos de usuarios')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo(MODULO_ADMINISTRAR_PERMISOS)
@Controller('permisos-usuarios')
export class PermisosController {
  constructor(private readonly servicio: PermisosService) {}

  @Get('usuarios')
  @ApiOperation({ summary: 'Lista los usuarios con acceso a los módulos de la plataforma.' })
  listarUsuarios(@Query() dto: ConsultarUsuariosPermisosDto) {
    return this.servicio.listarUsuarios(dto);
  }

  @Get()
  consultar(@Query() dto: UsuarioPermisosDto) {
    return this.servicio.consultar(dto.usuario);
  }

  @Get('posiciones')
  listarPosiciones(@Query() dto: ConsultarUsuariosPermisosDto) {
    return this.servicio.listarPosiciones(dto);
  }

  @Get('posiciones/:idPosicion')
  consultarPosicion(@Param('idPosicion', ParseIntPipe) idPosicion: number) {
    return this.servicio.consultarPosicion(idPosicion);
  }

  @Put('posiciones/:idPosicion')
  guardarPosicion(
    @Param('idPosicion', ParseIntPipe) idPosicion: number,
    @Body() dto: GuardarPermisosPosicionDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.guardarPosicion(idPosicion, dto.modulos, usuario.usuario);
  }
  @Put()
  guardar(@Body() dto: GuardarPermisosDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.guardar(dto, usuario.usuario);
  }
}
