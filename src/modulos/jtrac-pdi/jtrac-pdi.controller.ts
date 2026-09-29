import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import {
  BuscarFoliosJtracDto,
  ConsultarFolioJtracDto,
  ConsultarRelacionesJtracDto,
  ConsultarReporteJtracDto,
  GuardarRelacionJtracDto,
} from './dto/jtrac-pdi.dto';
import { MODULO_GESTION_JTRAC_PDI } from './jtrac-pdi.constantes';
import { JtracPdiService } from './jtrac-pdi.service';

@ApiTags('Relaciones JTRAC–PDI')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@Controller('jtrac-pdi')
export class JtracPdiController {
  constructor(private readonly servicio: JtracPdiService) {}

  @Get('estado')
  estado(@UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.estado(usuario);
  }

  @Get('reporte')
  reporte(@Query() dto: ConsultarReporteJtracDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.reporte(dto, usuario);
  }

  @Get('folios')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  folios(@Query() dto: BuscarFoliosJtracDto) {
    return this.servicio.buscarFolios(dto.busqueda);
  }

  @Get('indicadores')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  indicadores(@Query() dto: ConsultarFolioJtracDto) {
    return this.servicio.indicadores(dto.folioJtrac);
  }

  @Get('relaciones')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  consultar(@Query() dto: ConsultarRelacionesJtracDto) {
    return this.servicio.consultar(dto);
  }

  @Post('relaciones')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  crear(@Body() dto: GuardarRelacionJtracDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.crear(dto, usuario);
  }

  @Patch('relaciones/:idRelacion')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  actualizar(
    @Param('idRelacion', ParseIntPipe) idRelacion: number,
    @Body() dto: GuardarRelacionJtracDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.actualizar(idRelacion, dto, usuario);
  }

  @Delete('relaciones/:idRelacion')
  @HttpCode(204)
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  eliminar(@Param('idRelacion', ParseIntPipe) idRelacion: number) {
    return this.servicio.eliminar(idRelacion);
  }
}
