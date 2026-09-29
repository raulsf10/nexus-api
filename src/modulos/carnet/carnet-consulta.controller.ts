import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultarCarnetDto } from './dto/consultar-carnet.dto';
import { ResultadoConsultaCarnet } from './entidades/registro-carnet.entidad';
import { CarnetConsultaService } from './carnet-consulta.service';

@ApiTags('Carnet')
@ApiBearerAuth()
@Controller('carnet')
export class CarnetConsultaController {
  constructor(private readonly servicio: CarnetConsultaService) {}

  @Get()
  @ApiOperation({
    summary: 'Consulta paginada de dim_veo_carnet.',
  })
  consultar(@Query() filtros: ConsultarCarnetDto): Promise<ResultadoConsultaCarnet> {
    return this.servicio.consultar(filtros);
  }
}
