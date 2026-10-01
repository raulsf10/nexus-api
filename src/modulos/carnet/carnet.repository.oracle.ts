import { Injectable } from '@nestjs/common';
import { CarnetEstatusInstalacionEsquemaService } from '../../base-datos/oracle/carnet-estatus-instalacion-esquema.service';
import { EjecutorOracle, OracleService } from '../../base-datos/oracle/oracle.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { EstatusInstalacion } from './enums/estatus-instalacion.enum';

const NOMBRE_SP = 'dwh_suka.SP_CI_CARNET';

@Injectable()
export class CarnetRepositoryOracle {
  constructor(
    private readonly oracle: OracleService,
    private readonly esquemaEstatusInstalacion: CarnetEstatusInstalacionEsquemaService,
  ) {}

  async asegurarEstatusInstalacionDisponible(): Promise<void> {
    if (await this.esquemaEstatusInstalacion.estaDisponible()) {
      return;
    }
    throw new ExcepcionNegocio(
      CodigosError.VALIDACION,
      'El estatus de instalación requiere aplicar primero la tabla externa de estatus.',
      409,
    );
  }

  async existeAsignacion(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<boolean> {
    const sql = `
      SELECT 1
      FROM dwh_suka.dim_veo_carnet
      WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        AND ROWNUM = 1
    `;
    const filas = await ejecutor.ejecutar(sql, { skEmpleado, fkVeo });
    return filas.length > 0;
  }

  async obtenerAsignacion(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle = this.oracle,
    bloquear = false,
  ): Promise<{ idCarnet: string; activo: number; frecuencia: string | null } | null> {
    const sql = `
      SELECT TO_CHAR(sk_carnet) AS id_carnet, activo, frecuencia
      FROM dwh_suka.dim_veo_carnet
      WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        AND ROWNUM = 1
      ${bloquear ? 'FOR UPDATE' : ''}
    `;
    const filas = await ejecutor.ejecutar<{
      ID_CARNET: string;
      ACTIVO?: unknown;
      FRECUENCIA?: unknown;
    }>(sql, {
      skEmpleado,
      fkVeo,
    });
    if (filas.length === 0) return null;
    const fila = filas[0];
    return {
      idCarnet: fila.ID_CARNET,
      activo: Number(fila['ACTIVO'] ?? 0),
      frecuencia: fila['FRECUENCIA'] ? String(fila['FRECUENCIA']).trim() : null,
    };
  }

  async agregar(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<void> {
    await ejecutor.ejecutarSp(NOMBRE_SP, [
      { nombre: 'tipo', valor: 1, tipo: 'numero' },
      { nombre: 'idInforme', valor: fkVeo, tipo: 'numero' },
      { nombre: 'skEmpleado', valor: skEmpleado, tipo: 'numero' },
      { nombre: 'valor', valor: null, tipo: 'texto' },
      { nombre: 'fkveo', valor: null, tipo: 'numero' },
      { nombre: 'tabla', valor: null, tipo: 'numero' },
    ]);
  }

  async actualizarActivo(
    skEmpleado: number,
    fkVeo: number,
    activo: 0 | 1,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<void> {
    await ejecutor.ejecutarSp(NOMBRE_SP, [
      { nombre: 'tipo', valor: 2, tipo: 'numero' },
      { nombre: 'idInforme', valor: 0, tipo: 'numero' },
      { nombre: 'skEmpleado', valor: skEmpleado, tipo: 'numero' },
      { nombre: 'valor', valor: String(activo), tipo: 'texto' },
      { nombre: 'fkveo', valor: fkVeo, tipo: 'numero' },
      { nombre: 'tabla', valor: 1, tipo: 'numero' },
    ]);
  }

  async actualizarFrecuencia(
    skEmpleado: number,
    fkVeo: number,
    frecuencia: string,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<void> {
    // SP_CI_CARNET declara `valor IN INTEGER`, lo que impide enviar un VARCHAR2
    // como 'Mensual' a la columna frecuencia (ORA-01722). UPDATE directo a la
    // misma tabla y filtro que usa la rama tabla=2 del SP, hasta que el DBA
    // corrija la firma del SP a VARCHAR2.
    const sql = `
      UPDATE dwh_suka.dim_veo_carnet
      SET frecuencia = :frecuencia
      WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
    `;
    await ejecutor.ejecutar(sql, { frecuencia, skEmpleado, fkVeo });
  }

  async actualizarEstatusInstalacion(
    skEmpleado: number,
    fkVeo: number,
    estatusInstalacion: EstatusInstalacion | null,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<void> {
    await this.asegurarEstatusInstalacionDisponible();
    if (estatusInstalacion === null) {
      await ejecutor.ejecutar(
        `
          DELETE FROM dwh_suka.dim_ci_carnet_estatus
          WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        `,
        { skEmpleado, fkVeo },
      );
      return;
    }
    const sql = `
      MERGE INTO dwh_suka.dim_ci_carnet_estatus destino
      USING (
        SELECT :skEmpleado AS fk_posicion, :fkVeo AS fk_veo, :estatusInstalacion AS estatus_instalacion
        FROM dual
      ) origen
      ON (destino.fk_posicion = origen.fk_posicion AND destino.fk_veo = origen.fk_veo)
      WHEN MATCHED THEN
        UPDATE SET destino.estatus_instalacion = origen.estatus_instalacion
      WHEN NOT MATCHED THEN
        INSERT (fk_posicion, fk_veo, estatus_instalacion)
        VALUES (origen.fk_posicion, origen.fk_veo, origen.estatus_instalacion)
    `;
    await ejecutor.ejecutar(sql, { estatusInstalacion, skEmpleado, fkVeo });
  }

  async obtenerEstatusInstalacion(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<string | null> {
    const filas = await ejecutor.ejecutar<{ ESTATUS_INSTALACION: string }>(
      'SELECT estatus_instalacion FROM dwh_suka.dim_ci_carnet_estatus WHERE fk_posicion=:skEmpleado AND fk_veo=:fkVeo',
      { skEmpleado, fkVeo },
    );
    return filas[0]?.ESTATUS_INSTALACION?.trim() ?? null;
  }

  async eliminar(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle = this.oracle,
  ): Promise<void> {
    await ejecutor.ejecutarSp(NOMBRE_SP, [
      { nombre: 'tipo', valor: 3, tipo: 'numero' },
      { nombre: 'idInforme', valor: null, tipo: 'numero' },
      { nombre: 'skEmpleado', valor: skEmpleado, tipo: 'numero' },
      { nombre: 'valor', valor: null, tipo: 'texto' },
      { nombre: 'fkveo', valor: fkVeo, tipo: 'numero' },
      { nombre: 'tabla', valor: null, tipo: 'numero' },
    ]);
    if (
      (await this.esquemaEstatusInstalacion.estaDisponible()) &&
      (await this.tieneEstatusInstalacion(skEmpleado, fkVeo, ejecutor))
    ) {
      await ejecutor.ejecutar(
        `
          DELETE FROM dwh_suka.dim_ci_carnet_estatus
          WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        `,
        { skEmpleado, fkVeo },
      );
    }
  }

  private async tieneEstatusInstalacion(
    skEmpleado: number,
    fkVeo: number,
    ejecutor: EjecutorOracle,
  ): Promise<boolean> {
    const filas = await ejecutor.ejecutar(
      `
        SELECT 1
        FROM dwh_suka.dim_ci_carnet_estatus
        WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
          AND ROWNUM = 1
      `,
      { skEmpleado, fkVeo },
    );
    return filas.length > 0;
  }
}
