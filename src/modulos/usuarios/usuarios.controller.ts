import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioListadoEntidad } from './entidades/usuario-listado.entidad';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly servicio: UsuariosService) {}

  @Get('buscar')
  @ApiOperation({ summary: 'Busca usuarios por texto en descripción (mín. 2 caracteres).' })
  buscar(@Query('texto') texto?: string): Promise<UsuarioListadoEntidad[]> {
    return this.servicio.buscar(texto ?? '');
  }

  @Get(':skEmpleado')
  @ApiOperation({ summary: 'Obtiene un usuario por su sk_empleado.' })
  obtener(
    @Param('skEmpleado', ParseIntPipe) skEmpleado: number,
  ): Promise<UsuarioListadoEntidad> {
    return this.servicio.obtenerPorSkEmpleado(skEmpleado);
  }
}
