import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { MODULO_EXCEPCIONES_CARNET } from '../excepciones-carnet/excepciones-carnet.constantes';
import { ConsultarExcepcionesCarnetDto } from '../excepciones-carnet/dto/consultar-excepciones-carnet.dto';
import { ExcepcionesNotificacionesService } from './excepciones-notificaciones.service';

export class CrearExcepcionNotificacionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(9999999999)
  idInforme!: number;
}

@ApiTags('Excepciones de notificaciones')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo(MODULO_EXCEPCIONES_CARNET)
@Controller('excepciones-notificaciones')
export class ExcepcionesNotificacionesController {
  constructor(private readonly servicio: ExcepcionesNotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Consulta informes excluidos de todos los correos.' })
  consultar(@Query() dto: ConsultarExcepcionesCarnetDto) {
    return this.servicio.consultar(dto);
  }

  @Post()
  @HttpCode(201)
  crear(@Body() dto: CrearExcepcionNotificacionDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.crear(dto.idInforme, usuario.usuario);
  }

  @Delete(':idInforme')
  @HttpCode(204)
  eliminar(@Param('idInforme', ParseIntPipe) idInforme: number) {
    return this.servicio.eliminar(idInforme);
  }
}
