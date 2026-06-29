import { Injectable } from '@nestjs/common';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';

@Injectable()
export class CarnetService {
  constructor(
    private readonly oracle: CarnetRepositoryOracle,
    private readonly sqlServer: CarnetRepositorySqlServer,
    private readonly logger: LoggerService,
  ) {}

  async agregar(skEmpleado: number, fkVeo: number): Promise<void> {
    // SP_CI_CARNET no valida duplicados antes de INSERT; dim_veo_carnet tiene
    // unique en (fk_posicion, fk_veo), así que sin pre-check explota con
    // ORA-00001 y el usuario solo ve "Error al ejecutar el SP".
    const yaExiste = await this.oracle.existeAsignacion(skEmpleado, fkVeo);
    if (yaExiste) {
      throw new ExcepcionNegocio(
        CodigosError.CARNET_REGISTRO_DUPLICADO,
        `El informe ${fkVeo} ya está asignado a la posición ${skEmpleado}.`,
        409,
      );
    }
    await this.oracle.agregar(skEmpleado, fkVeo);
    try {
      await this.sqlServer.agregar(skEmpleado, fkVeo);
    } catch (error) {
      this.registrarFalloEspejo('agregar', { skEmpleado, fkVeo }, error);
    }
  }

  async actualizarActivo(skEmpleado: number, fkVeo: number, activo: 0 | 1): Promise<void> {
    await this.oracle.actualizarActivo(skEmpleado, fkVeo, activo);
    try {
      await this.sqlServer.actualizarActivo(skEmpleado, fkVeo, activo);
    } catch (error) {
      this.registrarFalloEspejo('actualizarActivo', { skEmpleado, fkVeo, activo }, error);
    }
  }

  async actualizarFrecuencia(
    skEmpleado: number,
    fkVeo: number,
    frecuencia: string,
  ): Promise<void> {
    await this.oracle.actualizarFrecuencia(skEmpleado, fkVeo, frecuencia);
    try {
      await this.sqlServer.actualizarFrecuencia(skEmpleado, fkVeo, frecuencia);
    } catch (error) {
      this.registrarFalloEspejo(
        'actualizarFrecuencia',
        { skEmpleado, fkVeo, frecuencia },
        error,
      );
    }
  }

  async eliminar(skEmpleado: number, fkVeo: number): Promise<void> {
    await this.oracle.eliminar(skEmpleado, fkVeo);
    try {
      await this.sqlServer.eliminar(skEmpleado, fkVeo);
    } catch (error) {
      this.registrarFalloEspejo('eliminar', { skEmpleado, fkVeo }, error);
    }
  }

  private registrarFalloEspejo(
    operacion: string,
    datos: Record<string, unknown>,
    error: unknown,
  ): void {
    this.logger.advertencia(`Mirror SQL Server falló en Carnet.${operacion}`, {
      ...datos,
      error: (error as Error).message,
    });
  }
}
