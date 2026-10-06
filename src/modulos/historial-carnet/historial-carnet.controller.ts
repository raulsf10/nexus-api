import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultarHistorialDto } from './dto/consultar-historial.dto';
import { ResultadoHistorial } from './entidades/historial-carnet.entidad';
import { HistorialCarnetService } from './historial-carnet.service';

@ApiTags('Historial de carnet')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo('Historial Carnet')
@Controller('historial-carnet')
export class HistorialCarnetController {
  constructor(private readonly servicio: HistorialCarnetService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta el historial de cambios de asignación de informes (filtros: usuario, informe, posición, rango de fechas).',
  })
  async consultar(@Query() filtros: ConsultarHistorialDto): Promise<ResultadoHistorial> {
    return this.servicio.consultar(filtros);
  }
}
