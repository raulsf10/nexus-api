import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { AccionHistorial } from '../historial-carnet/enums/accion-historial.enum';
import { OrigenHistorial } from '../historial-carnet/enums/origen-historial.enum';
import { HistorialCarnetService } from '../historial-carnet/historial-carnet.service';
import { NotificacionesCarnetService } from '../notificaciones-carnet/notificaciones-carnet.service';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';
import { EstatusInstalacion } from './enums/estatus-instalacion.enum';
import { SlaCarnetService } from '../notificaciones-carnet/sla-carnet.service';
import { CambioCarnetCorreo } from '../notificaciones-carnet/interfaces/cambio-carnet-correo.interface';

interface InformeLoteCarnet {
  fkVeo: number;
  frecuencia?: string | null;
  estatusInstalacion?: EstatusInstalacion | null;
}

@Injectable()
export class CarnetService {
  constructor(
    private readonly carnetOracle: CarnetRepositoryOracle,
    private readonly carnetSqlServer: CarnetRepositorySqlServer,
    private readonly historial: HistorialCarnetService,
    private readonly oracle: OracleService,
    private readonly notificaciones: NotificacionesCarnetService,
    private readonly logger: LoggerService,
    private readonly sla: SlaCarnetService,
  ) {}

  async agregar(
    skEmpleado: number,
    fkVeo: number,
    estatusInstalacion: EstatusInstalacion | null,
    usuario: string,
  ): Promise<void> {
    await this.agregarLote(skEmpleado, [{ fkVeo, estatusInstalacion }], usuario);
  }

  async agregarLote(
    skEmpleado: number,
    informes: InformeLoteCarnet[],
    usuario: string,
  ): Promise<void> {
    await this.sla.asegurarDisponible(informes.map((informe) => informe.fkVeo));
    const cambios: CambioCarnetCorreo[] = informes.map((informe) => ({
      idPosicion: skEmpleado,
      idInforme: informe.fkVeo,
      tipo: 'asignacion',
      usuario,
      origen: 'Manual',
    }));
    let avisosPreparados: string[] = [];
    if (
      informes.some(
        (informe) =>
          informe.estatusInstalacion !== null && informe.estatusInstalacion !== undefined,
      )
    ) {
      await this.carnetOracle.asegurarEstatusInstalacionDisponible();
    }

    // Las altas del mismo envío son atómicas. Con esto el frontend puede
    // mandar varios informes en una sola operación y se genera un solo aviso.
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      for (const informe of informes) {
        // SP_CI_CARNET no valida duplicados antes de INSERT; dim_veo_carnet
        // tiene unique en (fk_posicion, fk_veo), así que se valida primero.
        const yaExiste = await this.carnetOracle.existeAsignacion(
          skEmpleado,
          informe.fkVeo,
          ejecutor,
        );
        if (yaExiste) {
          throw new ExcepcionNegocio(
            CodigosError.CARNET_REGISTRO_DUPLICADO,
            `El informe ${informe.fkVeo} ya está asignado a la posición ${skEmpleado}.`,
            409,
          );
        }
        await this.carnetOracle.agregar(skEmpleado, informe.fkVeo, ejecutor);
        if (this.sla.aplica(informe.fkVeo)) {
          await this.carnetOracle.actualizarActivo(skEmpleado, informe.fkVeo, 0, ejecutor);
        }
        const frecuencia = this.normalizarFrecuencia(informe.frecuencia);
        if (frecuencia !== null) {
          await this.carnetOracle.actualizarFrecuencia(
            skEmpleado,
            informe.fkVeo,
            frecuencia,
            ejecutor,
          );
        }
        if (informe.estatusInstalacion !== null && informe.estatusInstalacion !== undefined) {
          await this.carnetOracle.actualizarEstatusInstalacion(
            skEmpleado,
            informe.fkVeo,
            informe.estatusInstalacion,
            ejecutor,
          );
        }
      }
      avisosPreparados = await this.sla.prepararAsignaciones(cambios, ejecutor);
    });

    for (const informe of informes) {
      const frecuencia = this.normalizarFrecuencia(informe.frecuencia);
      await this.replicarEspejo('agregar', { skEmpleado, fkVeo: informe.fkVeo }, async () => {
        await this.carnetSqlServer.agregar(
          skEmpleado,
          informe.fkVeo,
          this.sla.aplica(informe.fkVeo) ? 0 : 1,
        );
        if (frecuencia !== null) {
          await this.carnetSqlServer.actualizarFrecuencia(skEmpleado, informe.fkVeo, frecuencia);
        }
      });
      await this.historial.registrarCambio({
        usuario,
        accion: AccionHistorial.ASIGNAR,
        fkPosicion: skEmpleado,
        fkVeo: informe.fkVeo,
        frecuencia,
        origen: OrigenHistorial.MANUAL,
      });
    }
    await this.sla.confirmarAsignaciones(avisosPreparados);
    await this.notificaciones.enviarCambios(cambios);
  }

  async actualizarEstatusInstalacion(
    skEmpleado: number,
    fkVeo: number,
    estatusInstalacion: EstatusInstalacion | null,
  ): Promise<void> {
    if (!(await this.carnetOracle.existeAsignacion(skEmpleado, fkVeo))) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'El informe no está asignado a la posición; no se puede guardar su estatus.',
        409,
      );
    }
    await this.carnetOracle.actualizarEstatusInstalacion(skEmpleado, fkVeo, estatusInstalacion);
  }

  async actualizarActivo(
    skEmpleado: number,
    fkVeo: number,
    activo: 0 | 1,
    usuario: string,
  ): Promise<void> {
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      await this.carnetOracle.obtenerAsignacion(skEmpleado, fkVeo, ejecutor, true);
      await this.sla.validarCambioManual(skEmpleado, fkVeo);
      await this.carnetOracle.actualizarActivo(skEmpleado, fkVeo, activo, ejecutor);
    });
    await this.replicarEspejo('actualizarActivo', { skEmpleado, fkVeo, activo }, () =>
      this.carnetSqlServer.actualizarActivo(skEmpleado, fkVeo, activo),
    );
    await this.historial.registrarCambio({
      usuario,
      accion: activo === 1 ? AccionHistorial.ACTIVAR : AccionHistorial.DESACTIVAR,
      fkPosicion: skEmpleado,
      fkVeo,
      origen: OrigenHistorial.MANUAL,
    });
  }

  async actualizarFrecuencia(
    skEmpleado: number,
    fkVeo: number,
    frecuencia: string,
    usuario: string,
  ): Promise<void> {
    await this.carnetOracle.actualizarFrecuencia(skEmpleado, fkVeo, frecuencia);
    await this.replicarEspejo('actualizarFrecuencia', { skEmpleado, fkVeo, frecuencia }, () =>
      this.carnetSqlServer.actualizarFrecuencia(skEmpleado, fkVeo, frecuencia),
    );
    await this.historial.registrarCambio({
      usuario,
      accion: AccionHistorial.CAMBIO_FRECUENCIA,
      fkPosicion: skEmpleado,
      fkVeo,
      frecuencia,
      origen: OrigenHistorial.MANUAL,
    });
  }

  async eliminar(skEmpleado: number, fkVeo: number, usuario: string): Promise<void> {
    await this.eliminarLote(skEmpleado, [fkVeo], usuario);
  }

  async eliminarLote(skEmpleado: number, fkVeos: number[], usuario: string): Promise<void> {
    const retirados: number[] = [];
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      for (const fkVeo of fkVeos) {
        const asignacion = await this.carnetOracle.obtenerAsignacion(
          skEmpleado,
          fkVeo,
          ejecutor,
          true,
        );
        if (!asignacion) continue;
        // El SP reutiliza MAX(sk_carnet)+1. Cancelar bajo el bloqueo Oracle evita
        // que un retiro atrasado cancele o habilite una reasignación posterior.
        await this.sla.cancelarAsignacion(skEmpleado, fkVeo);
        await this.carnetOracle.eliminar(skEmpleado, fkVeo, ejecutor);
        retirados.push(fkVeo);
      }
    });

    for (const fkVeo of retirados) {
      await this.replicarEspejo('eliminar', { skEmpleado, fkVeo }, () =>
        this.carnetSqlServer.eliminar(skEmpleado, fkVeo),
      );
      await this.historial.registrarCambio({
        usuario,
        accion: AccionHistorial.ELIMINAR,
        fkPosicion: skEmpleado,
        fkVeo,
        origen: OrigenHistorial.MANUAL,
      });
    }
    await this.notificaciones.enviarCambios(
      retirados.map((fkVeo) => ({
        idPosicion: skEmpleado,
        idInforme: fkVeo,
        tipo: 'eliminacion' as const,
        usuario,
        origen: 'Manual' as const,
      })),
    );
  }

  private normalizarFrecuencia(frecuencia: string | null | undefined): string | null {
    const valor = frecuencia?.trim() ?? '';
    return valor.length > 0 ? valor : null;
  }

  private async replicarEspejo(
    operacion: string,
    datos: Record<string, unknown>,
    accion: () => Promise<void>,
  ): Promise<void> {
    try {
      await accion();
    } catch (error) {
      this.logger.advertencia(`Mirror SQL Server falló en Carnet.${operacion}`, {
        ...datos,
        error: (error as Error).message,
      });
    }
  }
}
