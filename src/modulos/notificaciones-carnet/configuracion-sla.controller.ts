import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { ConfiguracionSlaService } from './configuracion-sla.service';
import { GuardarConfiguracionSlaDto } from './dto/guardar-configuracion-sla.dto';
import { GuardarSlaInformeDto } from './dto/guardar-sla-informe.dto';

@ApiTags('Configuración SLA')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo('Configuracion SLA')
@Controller('configuracion-sla')
export class ConfiguracionSlaController {
  constructor(private readonly servicio: ConfiguracionSlaService) {}
  @Get()
  consultar() {
    return this.servicio.consultar();
  }
  @Put()
  guardar(@Body() dto: GuardarConfiguracionSlaDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.guardar(dto, usuario.usuario);
  }

  @Put('informes/:idInforme')
  guardarInforme(
    @Param('idInforme', ParseIntPipe) idInforme: number,
    @Body() dto: GuardarSlaInformeDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.guardarInforme(idInforme, dto, usuario.usuario);
  }

  @Delete('informes/:idInforme')
  eliminarInforme(@Param('idInforme', ParseIntPipe) idInforme: number) {
    return this.servicio.eliminarInforme(idInforme);
  }
}
