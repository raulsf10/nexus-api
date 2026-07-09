import { Injectable } from '@nestjs/common';
import { EjecutorOracle, OracleService } from '../../base-datos/oracle/oracle.service';

const NOMBRE_SP = 'dwh_suka.SP_CI_CARNET';

@Injectable()
export class CarnetRepositoryOracle {
  constructor(private readonly oracle: OracleService) {}

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
  ): Promise<{ activo: number; frecuencia: string | null } | null> {
    const sql = `
      SELECT activo, frecuencia
      FROM dwh_suka.dim_veo_carnet
      WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        AND ROWNUM = 1
    `;
    const filas = await ejecutor.ejecutar<{ ACTIVO?: unknown; FRECUENCIA?: unknown }>(sql, {
      skEmpleado,
      fkVeo,
    });
    if (filas.length === 0) return null;
    const fila = filas[0];
    return {
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
  }
}
