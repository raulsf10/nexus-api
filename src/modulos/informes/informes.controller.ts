import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InformeAsignadoEntidad, InformeEntidad } from './entidades/informe.entidad';
import { InformesService } from './informes.service';

@ApiTags('Informes')
@ApiBearerAuth()
@Controller('informes')
export class InformesController {
  constructor(private readonly servicio: InformesService) {}

  @Get('buscar')
  @ApiOperation({ summary: 'Busca informes por texto en sk_veo o nombre largo (máx. 50).' })
  buscar(@Query('filtro') filtro?: string): Promise<InformeEntidad[]> {
    return this.servicio.buscar(filtro ?? '');
  }

  @Get('frecuencias')
  @ApiOperation({ summary: 'Lista las frecuencias distintas usadas en dim_veo_carnet.' })
  obtenerFrecuencias(): Promise<string[]> {
    return this.servicio.obtenerFrecuenciasDisponibles();
  }

  @Get('por-usuario/:skEmpleado')
  @ApiOperation({ summary: 'Devuelve los informes asignados a una posición.' })
  obtenerPorUsuario(
    @Param('skEmpleado', ParseIntPipe) skEmpleado: number,
  ): Promise<InformeAsignadoEntidad[]> {
    return this.servicio.obtenerListadoPorUsuario(skEmpleado);
  }
}
