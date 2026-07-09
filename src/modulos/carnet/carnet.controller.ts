import { Body, Controller, Delete, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { CarnetService } from './carnet.service';
import { ActualizarActivoDto } from './dto/actualizar-activo.dto';
import { ActualizarFrecuenciaDto } from './dto/actualizar-frecuencia.dto';
import { AgregarCarnetDto } from './dto/agregar-carnet.dto';
import { EliminarCarnetDto } from './dto/eliminar-carnet.dto';

type RespuestaCarnet = { exitoso: true };

@ApiTags('Carnet')
@ApiBearerAuth()
@Controller('carnet')
export class CarnetController {
  constructor(private readonly servicio: CarnetService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asigna un informe a una posición (dual-write Oracle + SQL Server).' })
  async agregar(
    @Body() dto: AgregarCarnetDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<RespuestaCarnet> {
    await this.servicio.agregar(dto.skEmpleado, dto.fkVeo, usuario.usuario);
    return { exitoso: true };
  }

  @Patch('activo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa o desactiva un informe del carnet.' })
  async actualizarActivo(
    @Body() dto: ActualizarActivoDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<RespuestaCarnet> {
    await this.servicio.actualizarActivo(dto.skEmpleado, dto.fkVeo, dto.activo, usuario.usuario);
    return { exitoso: true };
  }

  @Patch('frecuencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualiza la frecuencia de un informe del carnet.' })
  async actualizarFrecuencia(
    @Body() dto: ActualizarFrecuenciaDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<RespuestaCarnet> {
    await this.servicio.actualizarFrecuencia(
      dto.skEmpleado,
      dto.fkVeo,
      dto.frecuencia,
      usuario.usuario,
    );
    return { exitoso: true };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina la asignación de un informe a una posición.' })
  async eliminar(
    @Body() dto: EliminarCarnetDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<RespuestaCarnet> {
    await this.servicio.eliminar(dto.skEmpleado, dto.fkVeo, usuario.usuario);
    return { exitoso: true };
  }
}
