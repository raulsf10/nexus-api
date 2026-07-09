import { Injectable } from '@nestjs/common';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { AccionHistorial } from '../historial-carnet/enums/accion-historial.enum';
import { OrigenHistorial } from '../historial-carnet/enums/origen-historial.enum';
import { HistorialCarnetService } from '../historial-carnet/historial-carnet.service';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';

@Injectable()
export class CarnetService {
  constructor(
    private readonly carnetOracle: CarnetRepositoryOracle,
    private readonly carnetSqlServer: CarnetRepositorySqlServer,
    private readonly historial: HistorialCarnetService,
    private readonly logger: LoggerService,
  ) {}

  async agregar(skEmpleado: number, fkVeo: number, usuario: string): Promise<void> {
    // SP_CI_CARNET no valida duplicados antes de INSERT; dim_veo_carnet tiene
    // unique en (fk_posicion, fk_veo), así que sin pre-check explota con
    // ORA-00001 y el usuario solo ve "Error al ejecutar el SP".
    const yaExiste = await this.carnetOracle.existeAsignacion(skEmpleado, fkVeo);
    if (yaExiste) {
      throw new ExcepcionNegocio(
        CodigosError.CARNET_REGISTRO_DUPLICADO,
        `El informe ${fkVeo} ya está asignado a la posición ${skEmpleado}.`,
        409,
      );
    }
    await this.carnetOracle.agregar(skEmpleado, fkVeo);
    await this.replicarEspejo('agregar', { skEmpleado, fkVeo }, () =>
      this.carnetSqlServer.agregar(skEmpleado, fkVeo),
    );
    await this.historial.registrarCambio({
      usuario,
      accion: AccionHistorial.ASIGNAR,
      fkPosicion: skEmpleado,
      fkVeo,
      origen: OrigenHistorial.MANUAL,
    });
  }

  async actualizarActivo(
    skEmpleado: number,
    fkVeo: number,
    activo: 0 | 1,
    usuario: string,
  ): Promise<void> {
    await this.carnetOracle.actualizarActivo(skEmpleado, fkVeo, activo);
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
    await this.carnetOracle.eliminar(skEmpleado, fkVeo);
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
