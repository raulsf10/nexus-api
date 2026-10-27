import { Injectable, OnModuleInit } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { LoggerService } from '../../comun/logger/logger.service';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { GuardarConfiguracionSlaDto } from './dto/guardar-configuracion-sla.dto';
import { GuardarSlaInformeDto } from './dto/guardar-sla-informe.dto';
import { InformesRepository } from '../informes/informes.repository';
import { mensajeAsignacionPredeterminado } from './plantilla-carnet';

@Injectable()
export class ConfiguracionSlaService implements OnModuleInit {
  private origen: 'entorno' | 'base-datos' = 'entorno';
  private informesDisponibles = false;
  private mensajeInicialDisponible = false;
  private mensajeUsuarioDisponible = false;
  private plazoAnteriorDisponible = false;
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
        'No se pudo consultar la configuración SLA en SQL Server; se reintentará antes de asignar informes.',
      );
    }
  }

  async actualizarEfectiva(): Promise<void> {
    const columnas = await this.sql.ejecutar<{
      inicial: number | null;
      usuario: number | null;
      plazoAnterior: number | null;
    }>(
      `SELECT COL_LENGTH('dbo.CI_CONFIGURACION_SLA', 'mensaje_inicial') AS inicial,
        COL_LENGTH('dbo.CI_CONFIGURACION_SLA_INFORME', 'mensaje_usuario') AS usuario,
        COL_LENGTH('dbo.CI_CONFIGURACION_SLA', 'sla_minutos') AS plazoAnterior`,
    );
    this.mensajeInicialDisponible = !!columnas[0]?.inicial;
    this.mensajeUsuarioDisponible = !!columnas[0]?.usuario;
    this.plazoAnteriorDisponible = !!columnas[0]?.plazoAnterior;
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
      ? await this.sql.ejecutar<{
          idInforme: number;
          slaMinutos: number;
          activa: boolean;
          mensajeUsuario: string | null;
        }>(
          this.mensajeUsuarioDisponible
            ? 'SELECT id_informe AS idInforme, sla_minutos AS slaMinutos, activo AS activa, mensaje_usuario AS mensajeUsuario FROM dbo.CI_CONFIGURACION_SLA_INFORME'
            : 'SELECT id_informe AS idInforme, sla_minutos AS slaMinutos, activo AS activa, NULL AS mensajeUsuario FROM dbo.CI_CONFIGURACION_SLA_INFORME',
        )
      : [];
    this.configuracion.establecerReglasSla(
      reglas.map((regla) => ({
        idInforme: Number(regla.idInforme),
        slaMinutos: Number(regla.slaMinutos),
        activa: !!regla.activa,
        mensajeUsuario: regla.mensajeUsuario ?? null,
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
      destinatariosIniciales: cfg.destinatariosIniciales,
      mensajeInicial: cfg.mensajeInicial,
      origenConfiguracion: this.origen,
      activo: cfg.escalonadosActivos,
      informesSla: cfg.informesSla,
      informesDisponibles: this.informesDisponibles,
      reglas: cfg.reglasSla
        .map((regla) => {
          const predeterminado = mensajeAsignacionPredeterminado(regla.idInforme);
          const mensaje = regla.mensajeUsuario?.trim() || predeterminado;
          return {
            ...regla,
            nombreInforme: nombres.get(regla.idInforme) ?? null,
            mensajeUsuario: mensaje,
            mensajePersonalizado: mensaje !== predeterminado,
          };
        })
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
    this.validarColumnaMensaje(this.mensajeUsuarioDisponible, dto.mensajeUsuario);
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
      if (this.mensajeUsuarioDisponible && dto.mensajeUsuario !== undefined) {
        await ejecutar(
          'UPDATE dbo.CI_CONFIGURACION_SLA_INFORME SET mensaje_usuario=@mensaje WHERE id_informe=@idInforme',
          { idInforme, mensaje: dto.mensajeUsuario?.trim() || null },
        );
      }
    });
    await this.actualizarEfectiva();
    return { exitoso: true };
  }

  async guardar(dto: GuardarConfiguracionSlaDto, usuario: string) {
    await this.actualizarEfectiva();
    this.validarColumnaMensaje(this.mensajeInicialDisponible, dto.mensajeInicial);
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
        SET correos_iniciales = @correos,
            usuario_actualizacion = @usuario, fecha_actualizacion = GETDATE()
        WHERE id_configuracion = 1;
        IF @@ROWCOUNT = 0
          INSERT INTO dbo.CI_CONFIGURACION_SLA
            (id_configuracion, ${this.plazoAnteriorDisponible ? 'sla_minutos,' : ''} correos_iniciales, usuario_actualizacion, fecha_actualizacion)
          VALUES (1, ${this.plazoAnteriorDisponible ? '1440,' : ''} @correos, @usuario, GETDATE());`,
        { correos: correos.join(','), usuario },
      );
      if (this.mensajeInicialDisponible && dto.mensajeInicial !== undefined) {
        await ejecutar(
          'UPDATE dbo.CI_CONFIGURACION_SLA SET mensaje_inicial=@mensaje WHERE id_configuracion=1',
          { mensaje: dto.mensajeInicial?.trim() || null },
        );
      }
    });
    await this.actualizarEfectiva();
    return { exitoso: true };
  }

  async eliminarInforme(idInforme: number) {
    if (!Number.isInteger(idInforme) || idInforme < 1 || idInforme > 2147483647) {
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El ID de informe no es válido.');
    }
    await this.sql.ejecutar(
      'DELETE FROM dbo.CI_CONFIGURACION_SLA_INFORME WHERE id_informe=@idInforme',
      { idInforme },
    );
    await this.actualizarEfectiva();
    return { exitoso: true };
  }

  private async cargar(): Promise<void> {
    const filas = await this.sql.ejecutar<{
      correos_iniciales: string;
      mensaje_inicial: string | null;
    }>(
      this.mensajeInicialDisponible
        ? 'SELECT correos_iniciales, mensaje_inicial FROM dbo.CI_CONFIGURACION_SLA WHERE id_configuracion = 1'
        : 'SELECT correos_iniciales, NULL AS mensaje_inicial FROM dbo.CI_CONFIGURACION_SLA WHERE id_configuracion = 1',
    );
    const fila = filas[0];
    this.configuracion.establecerSlaGuardado(
      fila
        ? {
            mensajeInicial: fila.mensaje_inicial ?? null,
            destinatariosIniciales: fila.correos_iniciales
              .split(',')
              .map((correo) => correo.trim())
              .filter(Boolean),
          }
        : undefined,
    );
    this.origen = fila ? 'base-datos' : 'entorno';
  }

  private validarColumnaMensaje(disponible: boolean, mensaje: string | null | undefined): void {
    if (!disponible && mensaje?.trim()) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Falta aplicar la actualización de mensajes SLA en SQL Server.',
        503,
      );
    }
  }
}
