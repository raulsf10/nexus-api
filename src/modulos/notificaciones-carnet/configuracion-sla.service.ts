import { Injectable, OnModuleInit } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { LoggerService } from '../../comun/logger/logger.service';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { GuardarConfiguracionSlaDto } from './dto/guardar-configuracion-sla.dto';
import { GuardarSlaInformeDto } from './dto/guardar-sla-informe.dto';
import { InformesRepository } from '../informes/informes.repository';

@Injectable()
export class ConfiguracionSlaService implements OnModuleInit {
  private origen: 'entorno' | 'base-datos' = 'entorno';
  private informesDisponibles = false;
  constructor(
    private readonly sql: SqlServerService,
    private readonly configuracion: ConfiguracionService,
    private readonly logger: LoggerService,
    private readonly informes: InformesRepository,
  ) {}

  obtenerOrigen(): 'entorno' | 'base-datos' {
    return this.origen;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.actualizarEfectiva();
    } catch {
      this.logger.advertencia(
        'Configuración SLA no disponible; se conserva la configuración del entorno.',
      );
    }
  }

  async actualizarEfectiva(): Promise<void> {
    const filas = await this.sql.ejecutar<{ existe: number | null }>(
      "SELECT OBJECT_ID('dbo.CI_CONFIGURACION_SLA', 'U') AS existe",
    );
    if (!filas[0]?.existe) {
      this.configuracion.establecerSlaGuardado(undefined);
      this.origen = 'entorno';
    } else {
      await this.cargar();
    }
    const esquema = await this.sql.ejecutar<{ existe: number | null }>(
      "SELECT OBJECT_ID('dbo.CI_CONFIGURACION_SLA_INFORME', 'U') AS existe",
    );
    this.informesDisponibles = !!esquema[0]?.existe;
    const reglas = this.informesDisponibles
      ? await this.sql.ejecutar<{ idInforme: number; slaMinutos: number; activa: boolean }>(
          'SELECT id_informe AS idInforme, sla_minutos AS slaMinutos, activo AS activa FROM dbo.CI_CONFIGURACION_SLA_INFORME',
        )
      : [];
    this.configuracion.establecerReglasSla(
      reglas.map((regla) => ({
        idInforme: Number(regla.idInforme),
        slaMinutos: Number(regla.slaMinutos),
        activa: !!regla.activa,
      })),
    );
  }

  async consultar() {
    await this.actualizarEfectiva();
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    const nombres = new Map(
      (await this.informes.obtenerPorIds(cfg.reglasSla.map((regla) => regla.idInforme))).map(
        (informe) => [informe.skVeo, informe.nombre],
      ),
    );
    return {
      slaMinutos: cfg.slaMinutos,
      destinatariosIniciales: cfg.destinatariosIniciales,
      origenConfiguracion: this.origen,
      activo: cfg.escalonadosActivos,
      informesSla: cfg.informesSla,
      informesDisponibles: this.informesDisponibles,
      reglas: cfg.reglasSla
        .map((regla) => ({ ...regla, nombreInforme: nombres.get(regla.idInforme) ?? null }))
        .sort((a, b) => a.idInforme - b.idInforme),
    };
  }

  async guardarInforme(idInforme: number, dto: GuardarSlaInformeDto, usuario: string) {
    if (!Number.isInteger(idInforme) || idInforme < 1 || idInforme > 2147483647) {
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El ID de informe no es válido.');
    }
    await this.actualizarEfectiva();
    if (!this.informesDisponibles) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Falta actualizar la configuración de SLA. Contacta al administrador.',
        503,
      );
    }
    if (!(await this.informes.obtenerPorSkVeo(idInforme))) {
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El informe no existe.', 404);
    }
    await this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      await ejecutar(
        `UPDATE dbo.CI_CONFIGURACION_SLA_INFORME WITH (UPDLOCK, HOLDLOCK)
        SET sla_minutos=@minutos, activo=@activa, usuario_actualizacion=@usuario, fecha_actualizacion=GETDATE()
        WHERE id_informe=@idInforme;
        IF @@ROWCOUNT=0
          INSERT INTO dbo.CI_CONFIGURACION_SLA_INFORME
            (id_informe,sla_minutos,activo,usuario_actualizacion,fecha_actualizacion)
          VALUES (@idInforme,@minutos,@activa,@usuario,GETDATE());`,
        { idInforme, minutos: dto.slaMinutos, activa: dto.activa, usuario },
      );
    });
    await this.actualizarEfectiva();
    return { exitoso: true };
  }

  async guardar(dto: GuardarConfiguracionSlaDto, usuario: string) {
    const correos = [
      ...new Set(dto.destinatariosIniciales.map((correo) => correo.trim().toLowerCase())),
    ];
    if (correos.join(',').length > 1000) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'La lista de correos supera los 1,000 caracteres.',
      );
    }
    await this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      await ejecutar(
        `UPDATE dbo.CI_CONFIGURACION_SLA WITH (UPDLOCK, HOLDLOCK)
        SET sla_minutos = @minutos, correos_iniciales = @correos,
            usuario_actualizacion = @usuario, fecha_actualizacion = GETDATE()
        WHERE id_configuracion = 1;
        IF @@ROWCOUNT = 0
          INSERT INTO dbo.CI_CONFIGURACION_SLA
            (id_configuracion, sla_minutos, correos_iniciales, usuario_actualizacion, fecha_actualizacion)
          VALUES (1, @minutos, @correos, @usuario, GETDATE());`,
        { minutos: dto.slaMinutos, correos: correos.join(','), usuario },
      );
    });
    this.configuracion.establecerSlaGuardado({
      slaMinutos: dto.slaMinutos,
      destinatariosIniciales: correos,
    });
    this.origen = 'base-datos';
    return { exitoso: true };
  }

  private async cargar(): Promise<void> {
    const filas = await this.sql.ejecutar<{ sla_minutos: number; correos_iniciales: string }>(
      'SELECT sla_minutos, correos_iniciales FROM dbo.CI_CONFIGURACION_SLA WHERE id_configuracion = 1',
    );
    const fila = filas[0];
    this.configuracion.establecerSlaGuardado(
      fila
        ? {
            slaMinutos: fila.sla_minutos,
            destinatariosIniciales: fila.correos_iniciales
              .split(',')
              .map((correo) => correo.trim())
              .filter(Boolean),
          }
        : undefined,
    );
    this.origen = fila ? 'base-datos' : 'entorno';
  }
}
