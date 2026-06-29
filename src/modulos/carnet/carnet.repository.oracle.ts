import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';

const NOMBRE_SP = 'dwh_suka.SP_CI_CARNET';

@Injectable()
export class CarnetRepositoryOracle {
  constructor(private readonly oracle: OracleService) {}

  async existeAsignacion(skEmpleado: number, fkVeo: number): Promise<boolean> {
    const sql = `
      SELECT 1
      FROM dwh_suka.dim_veo_carnet
      WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo
        AND ROWNUM = 1
    `;
    const filas = await this.oracle.ejecutar(sql, { skEmpleado, fkVeo });
    return filas.length > 0;
  }

  async agregar(skEmpleado: number, fkVeo: number): Promise<void> {
    await this.oracle.ejecutarSp(NOMBRE_SP, [
      { nombre: 'tipo', valor: 1, tipo: 'numero' },
      { nombre: 'idInforme', valor: fkVeo, tipo: 'numero' },
      { nombre: 'skEmpleado', valor: skEmpleado, tipo: 'numero' },
      { nombre: 'valor', valor: null, tipo: 'texto' },
      { nombre: 'fkveo', valor: null, tipo: 'numero' },
      { nombre: 'tabla', valor: null, tipo: 'numero' },
    ]);
  }

  async actualizarActivo(skEmpleado: number, fkVeo: number, activo: 0 | 1): Promise<void> {
    await this.oracle.ejecutarSp(NOMBRE_SP, [
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
    await this.oracle.ejecutar(sql, { frecuencia, skEmpleado, fkVeo });
  }

  async eliminar(skEmpleado: number, fkVeo: number): Promise<void> {
    await this.oracle.ejecutarSp(NOMBRE_SP, [
      { nombre: 'tipo', valor: 3, tipo: 'numero' },
      { nombre: 'idInforme', valor: null, tipo: 'numero' },
      { nombre: 'skEmpleado', valor: skEmpleado, tipo: 'numero' },
      { nombre: 'valor', valor: null, tipo: 'texto' },
      { nombre: 'fkveo', valor: fkVeo, tipo: 'numero' },
      { nombre: 'tabla', valor: null, tipo: 'numero' },
    ]);
  }
}
