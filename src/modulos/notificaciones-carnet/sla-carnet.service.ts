import { Injectable } from '@nestjs/common';
import { EjecutorOracle, OracleService } from '../../base-datos/oracle/oracle.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CarnetRepositoryOracle } from '../carnet/carnet.repository.oracle';
import { CarnetRepositorySqlServer } from '../carnet/carnet.repository.sql-server';
import { AccionHistorial } from '../historial-carnet/enums/accion-historial.enum';
import { OrigenHistorial } from '../historial-carnet/enums/origen-historial.enum';
import { HistorialCarnetService } from '../historial-carnet/historial-carnet.service';
import {
  AvisoProgramadoCarnet,
  InformePendienteCarnet,
} from './interfaces/aviso-programado.interface';
import { CambioCarnetCorreo } from './interfaces/cambio-carnet-correo.interface';
import { NotificacionesProgramadasRepository } from './notificaciones-programadas.repository';
import { ConfiguracionSlaService } from './configuracion-sla.service';
import { ConfiguracionCorreoNotificacionesSeccion } from '../../configuracion/interfaces/configuracion-app.interface';
import { ExcepcionesNotificacionesService } from './excepciones-notificaciones.service';

@Injectable()
export class SlaCarnetService {
  constructor(
    private readonly configuracion: ConfiguracionService,
    private readonly programadas: NotificacionesProgramadasRepository,
    private readonly oracle: OracleService,
    private readonly carnetOracle: CarnetRepositoryOracle,
    private readonly carnetSqlServer: CarnetRepositorySqlServer,
    private readonly historial: HistorialCarnetService,
    private readonly logger: LoggerService,
    private readonly configuracionSla: ConfiguracionSlaService,
    private readonly excepciones: ExcepcionesNotificacionesService,
  ) {}

  aplica(idInforme: number, cfg = this.configuracion.obtenerCorreoNotificaciones()): boolean {
    return cfg.escalonadosActivos && cfg.informesSla.includes(idInforme);
  }

  async asegurarDisponible(
    idInformes: number[],
  ): Promise<ConfiguracionCorreoNotificacionesSeccion> {
    if (idInformes.length && this.configuracion.obtenerCorreoNotificaciones().escalonadosActivos) {
      await this.configuracionSla.actualizarEfectiva();
    }
    const excluidos = await this.excepciones.obtenerIds();
    const original = this.configuracion.obtenerCorreoNotificaciones();
    const cfg = {
      ...original,
      informesSla: original.informesSla.filter((id) => !excluidos.has(id)),
      reglasSla: original.reglasSla.filter((regla) => !excluidos.has(regla.idInforme)),
    };
    if (!idInformes.some((id) => this.aplica(id, cfg))) return cfg;
    if (!(await this.programadas.disponible())) {
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'No se asignaron informes: falta actualizar las tablas de avisos. Revisa db/simplificar_carnet_aviso.sql.',
        503,
      );
    }
    if (!cfg.host.trim() || !cfg.remitente.trim()) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Configura SMTP antes de asignar informes con activación por SLA.',
        503,
      );
    }
    if (!cfg.destinatariosIniciales.length) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Configura los destinatarios iniciales del SLA.',
        503,
      );
    }
    return cfg;
  }

  async estaPendiente(idPosicion: number, idInforme: number): Promise<boolean> {
    // Desactivar el trabajador no autoriza saltarse pendientes que ya existían.
    if (
      !this.configuracion.obtenerCorreoNotificaciones().escalonadosActivos &&
      !(await this.programadas.disponible(true))
    )
      return false;
    return this.programadas.tieneActivacionPendiente(idPosicion, idInforme);
  }

  async validarCambioManual(idPosicion: number, idInforme: number): Promise<void> {
    if (await this.estaPendiente(idPosicion, idInforme)) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'El informe está pendiente del SLA; no se puede cambiar su activación manualmente. Retira la asignación para cancelar el pendiente.',
        409,
      );
    }
  }

  async prepararAsignaciones(
    cambios: CambioCarnetCorreo[],
    ejecutor: EjecutorOracle,
    cfg: ConfiguracionCorreoNotificacionesSeccion,
  ): Promise<string[]> {
    const diferidos = cambios.filter(
      (cambio) => cambio.tipo === 'asignacion' && this.aplica(cambio.idInforme, cfg),
    );
    if (!diferidos.length) return [];
    for (const cambio of diferidos) {
      const asignacion = await this.carnetOracle.obtenerAsignacion(
        cambio.idPosicion,
        cambio.idInforme,
        ejecutor,
        true,
      );
      if (!asignacion?.idCarnet || asignacion.activo !== 0) {
        throw new Error('La asignación con SLA debe permanecer inactiva antes del commit.');
      }
      cambio.idCarnet = asignacion.idCarnet;
      cambio.activacionDiferida = true;
    }
    // SQL confirma la intención antes del commit Oracle, pero PREPARADO no puede enviar ni activar.
    return this.programadas.registrar(diferidos, cfg, true);
  }

  async confirmarAsignaciones(idAvisos: string[]): Promise<void> {
    if (!idAvisos.length) return;
    try {
      await this.programadas.confirmarPreparados(idAvisos);
    } catch {
      this.logger.advertencia(
        'Asignaciones inactivas con SLA sin confirmar; requieren conciliación.',
        { idAvisos },
      );
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'Las asignaciones quedaron inactivas, pero no se confirmó su cola SLA. Revisa los avisos PREPARADO antes de reintentar.',
        503,
      );
    }
  }

  async cancelarAsignacion(idPosicion: number, idInforme: number): Promise<void> {
    if (!(await this.programadas.disponible(true))) {
      if (this.configuracion.obtenerCorreoNotificaciones().escalonadosActivos) {
        throw new ExcepcionNegocio(
          CodigosError.SQL_SERVER_ERROR,
          'No se puede cancelar el SLA: revisa la cola de notificaciones.',
          503,
        );
      }
      return;
    }
    await this.programadas.cancelarAsignacion(idPosicion, idInforme);
  }

  async activar(aviso: AvisoProgramadoCarnet): Promise<number> {
    if (
      aviso.estado !== 'ACTIVACION' ||
      !aviso.fechaCorreoFinal ||
      !aviso.fechaProgramada ||
      new Date(aviso.fechaProgramada).getTime() > Date.now()
    ) {
      throw new Error('No se puede activar antes del SLA y de confirmar el correo final.');
    }
    const detalles = await this.programadas.detallesPendientes(aviso.idAviso);
    return this.activarDetalles(aviso, detalles, false);
  }

  async liberarExcluidos(aviso: AvisoProgramadoCarnet): Promise<void> {
    const excluidos = await this.excepciones.obtenerIds();
    const detalles = (await this.programadas.detallesPendientes(aviso.idAviso)).filter((detalle) =>
      excluidos.has(detalle.idInforme),
    );
    if (!detalles.length) return;
    if (aviso.slaMinutos != null) {
      await this.activarDetalles(aviso, detalles, true);
    } else {
      await this.programadas.cancelarInformes(
        aviso.idAviso,
        detalles.map((detalle) => detalle.idInforme),
      );
    }
  }

  private async activarDetalles(
    aviso: AvisoProgramadoCarnet,
    detalles: InformePendienteCarnet[],
    porExcepcion: boolean,
  ): Promise<number> {
    const activados: number[] = [];
    const vigentes = await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      const resultado: InformePendienteCarnet[] = [];
      for (const detalle of detalles) {
        const asignacion = await this.carnetOracle.obtenerAsignacion(
          aviso.idPosicion,
          detalle.idInforme,
          ejecutor,
          true,
        );
        if (!(await this.programadas.renovarBloqueo(aviso)))
          throw new Error('Bloqueo del aviso perdido.');
        if (!detalle.idCarnet || asignacion?.idCarnet !== detalle.idCarnet) {
          await this.programadas.cancelarInformes(aviso.idAviso, [detalle.idInforme]);
          continue;
        }
        if (!(await this.programadas.detalleVigente(aviso, detalle.idInforme, porExcepcion)))
          continue;
        if (asignacion.activo === 0) {
          await this.carnetOracle.actualizarActivo(
            aviso.idPosicion,
            detalle.idInforme,
            1,
            ejecutor,
          );
          activados.push(detalle.idInforme);
        }
        resultado.push(detalle);
      }
      return resultado;
    });
    for (const idInforme of activados) {
      await this.historial.registrarCambio({
        usuario: porExcepcion ? 'SISTEMA_EXCEPCION_CORREO' : 'SISTEMA_SLA',
        accion: AccionHistorial.ACTIVAR,
        fkPosicion: aviso.idPosicion,
        fkVeo: idInforme,
        origen: aviso.origen === 'Manual' ? OrigenHistorial.MANUAL : OrigenHistorial.CARGA_MASIVA,
      });
      this.logger.info(
        porExcepcion
          ? 'Informe activado sin correo por excepción de notificaciones.'
          : 'Informe activado al cumplir SLA y confirmar correo final.',
        {
          idAviso: aviso.idAviso,
          idPosicion: aviso.idPosicion,
          idInforme,
        },
      );
    }
    let sincronizados = 0;
    for (const detalle of vigentes) {
      await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
        const actual = await this.carnetOracle.obtenerAsignacion(
          aviso.idPosicion,
          detalle.idInforme,
          ejecutor,
          true,
        );
        if (!(await this.programadas.renovarBloqueo(aviso)))
          throw new Error('Bloqueo del aviso perdido.');
        if (actual?.idCarnet !== detalle.idCarnet) {
          await this.programadas.cancelarInformes(aviso.idAviso, [detalle.idInforme]);
          return;
        }
        if (!(await this.programadas.detalleVigente(aviso, detalle.idInforme, porExcepcion)))
          return;
        if (actual.activo !== 1)
          throw new Error('La asignación fue desactivada durante el procesamiento del SLA.');
        // La fila Oracle se bloquea para no modificar el espejo de una reasignación posterior.
        await this.carnetSqlServer.actualizarActivo(aviso.idPosicion, detalle.idInforme, 1, true);
        if (porExcepcion)
          await this.programadas.cancelarInformes(aviso.idAviso, [detalle.idInforme]);
        sincronizados++;
      });
    }
    return sincronizados;
  }
}
