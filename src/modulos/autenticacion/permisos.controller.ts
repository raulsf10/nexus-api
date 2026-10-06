import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from './guardias/requiere-modulo.guard';
import { GuardarPermisosDto, UsuarioPermisosDto } from './dto/guardar-permisos.dto';
import { MODULO_ADMINISTRAR_PERMISOS } from './permisos.constantes';
import { PermisosService } from './permisos.service';

@ApiTags('Permisos de usuarios')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo(MODULO_ADMINISTRAR_PERMISOS)
@Controller('permisos-usuarios')
export class PermisosController {
  constructor(private readonly servicio: PermisosService) {}
  @Get()
  consultar(@Query() dto: UsuarioPermisosDto) {
    return this.servicio.consultar(dto.usuario);
  }
  @Put()
  guardar(@Body() dto: GuardarPermisosDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.guardar(dto, usuario.usuario);
  }
}
