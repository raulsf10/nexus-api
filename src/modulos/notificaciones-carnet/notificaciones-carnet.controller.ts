import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { ConfiguracionSlaService } from './configuracion-sla.service';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { ConsultarAvisosDto } from './dto/guardar-regla-correo.dto';
import { NotificacionesProgramadasRepository } from './notificaciones-programadas.repository';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { CorreosPersonalizadosService } from './correos-personalizados.service';
import {
  DestinatariosPersonalizadosDto,
  EnviarCorreoPersonalizadoDto,
} from './dto/correo-personalizado.dto';

@ApiTags('Notificaciones de carnet')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo('Notificaciones')
@Controller('notificaciones-carnet')
export class NotificacionesCarnetController {
  constructor(
    private readonly repositorio: NotificacionesProgramadasRepository,
    private readonly configuracion: ConfiguracionService,
    private readonly personalizados: CorreosPersonalizadosService,
    private readonly configuracionSla: ConfiguracionSlaService,
  ) {}

  @Get('destinatarios')
  @ApiOperation({
    summary: 'Vista previa paginada de posiciones destinatarias, respetando excepciones.',
  })
  destinatarios(@Query() dto: DestinatariosPersonalizadosDto) {
    return this.personalizados.consultar(dto);
  }

  @Post('personalizados')
  @ApiOperation({
    summary: 'Envía un mensaje personalizado sin historial ni reintentos automáticos.',
  })
  enviarPersonalizado(
    @Body() dto: EnviarCorreoPersonalizadoDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.personalizados.enviar(dto, usuario.usuario);
  }

  @Get('configuracion')
  async consultar() {
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    const disponible = await this.repositorio.disponible().catch(() => false);
    return {
      disponible,
      activo: cfg.escalonadosActivos,
      usarCorreoPosicion: cfg.usarCorreoPosicion,
      zonaHoraria: cfg.zonaHoraria,
      origenConfiguracion: this.configuracionSla.obtenerOrigen(),
      destinatarioForzado: cfg.destinatarioForzado,
      destinatariosIniciales: cfg.destinatariosIniciales,
      informesSla: cfg.informesSla,
      reglas: [],
    };
  }

  @Put('reglas')
  @ApiOperation({
    deprecated: true,
    summary: 'Usar el módulo Configuración SLA para destinatarios e informes.',
  })
  guardar(): never {
    throw new ExcepcionNegocio(
      CodigosError.VALIDACION,
      'Configura destinatarios y plazos por informe en Configuración SLA.',
      409,
    );
  }

  @Get('avisos')
  async avisos(@Query() dto: ConsultarAvisosDto) {
    await this.exigirTablas();
    return this.repositorio.consultar(dto.pagina);
  }

  private async exigirTablas(): Promise<void> {
    if (!(await this.repositorio.disponible())) {
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'Falta actualizar las tablas de avisos en SQL Server. Revisa db/simplificar_carnet_aviso.sql.',
        503,
      );
    }
  }
}
