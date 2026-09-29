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
  ) {}

  aplica(idInforme: number): boolean {
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    return cfg.escalonadosActivos && cfg.informesSla.includes(idInforme);
  }

  async asegurarDisponible(idInformes: number[]): Promise<void> {
    if (!idInformes.some((id) => this.aplica(id))) return;
    if (!(await this.programadas.disponible())) {
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'No se asignaron informes: falta actualizar la cola SLA con db/notificaciones_escalonadas_carnet.sql.',
        503,
      );
    }
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    if (!cfg.host.trim() || !cfg.remitente.trim()) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Configura SMTP antes de asignar informes con activación por SLA.',
        503,
      );
    }
  }

  async estaPendiente(idPosicion: number, idInforme: number): Promise<boolean> {
    // Desactivar el trabajador no autoriza saltarse pendientes que ya existían.
    if (
      !this.configuracion.obtenerCorreoNotificaciones().escalonadosActivos &&
      !(await this.programadas.disponible())
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
  ): Promise<string[]> {
    const diferidos = cambios.filter(
      (cambio) => cambio.tipo === 'asignacion' && this.aplica(cambio.idInforme),
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
    return this.programadas.registrar(
      diferidos,
      this.configuracion.obtenerCorreoNotificaciones(),
      true,
    );
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
    if (!(await this.programadas.disponible())) {
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
        if (!(await this.programadas.detalleVigente(aviso, detalle.idInforme))) continue;
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
        usuario: 'SISTEMA_SLA',
        accion: AccionHistorial.ACTIVAR,
        fkPosicion: aviso.idPosicion,
        fkVeo: idInforme,
        origen: aviso.origen === 'Manual' ? OrigenHistorial.MANUAL : OrigenHistorial.CARGA_MASIVA,
      });
      this.logger.info('Informe activado al cumplir SLA y confirmar correo final.', {
        idAviso: aviso.idAviso,
        idPosicion: aviso.idPosicion,
        idInforme,
      });
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
        if (!(await this.programadas.detalleVigente(aviso, detalle.idInforme))) return;
        if (actual.activo !== 1)
          throw new Error('La asignación fue desactivada durante el procesamiento del SLA.');
        // La fila Oracle se bloquea para no modificar el espejo de una reasignación posterior.
        await this.carnetSqlServer.actualizarActivo(aviso.idPosicion, detalle.idInforme, 1, true);
        sincronizados++;
      });
    }
    return sincronizados;
  }
}
