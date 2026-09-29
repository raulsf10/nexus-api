import { Injectable } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';

@Injectable()
export class CarnetRepositorySqlServer {
  constructor(private readonly sqlServer: SqlServerService) {}

  async agregar(skEmpleado: number, fkVeo: number, activo: 0 | 1 = 1): Promise<void> {
    const sql = `
      INSERT INTO DIM_VEO_CARNET_SUKA
        (SK_CARNET, FK_VEO, FK_POSICION, ACTIVO, SIEMPRE_UNO, ORDEN_CATEGORIA,
         FK_GRUPO, COMENTARIOS, BUSQUEDACEROPAPEL, FRECUENCIA, FECHAALTA)
      VALUES
        ((SELECT ISNULL(MAX(sk_carnet), 0) + 1 FROM DIM_VEO_CARNET_SUKA),
         @fkVeo, @skEmpleado, @activo, 1, 0, 0, '', '', '',
         CONVERT(INT, CONVERT(VARCHAR(8), GETDATE(), 112)))
    `;
    await this.sqlServer.ejecutar(sql, { fkVeo, skEmpleado, activo });
  }

  async actualizarActivo(
    skEmpleado: number,
    fkVeo: number,
    activo: 0 | 1,
    exigirExistencia = false,
  ): Promise<void> {
    const sql = `
      UPDATE DIM_VEO_CARNET_SUKA
      SET    activo = @activo
      OUTPUT inserted.fk_veo
      WHERE  fk_posicion = @skEmpleado AND fk_veo = @fkVeo
    `;
    const filas = await this.sqlServer.ejecutar(sql, { activo, skEmpleado, fkVeo });
    if (exigirExistencia && filas.length === 0) {
      throw new Error('Falta la asignación en el espejo SQL Server; requiere conciliación.');
    }
  }

  async actualizarFrecuencia(skEmpleado: number, fkVeo: number, frecuencia: string): Promise<void> {
    const sql = `
      UPDATE DIM_VEO_CARNET_SUKA
      SET    frecuencia = @frecuencia
      WHERE  fk_posicion = @skEmpleado AND fk_veo = @fkVeo
    `;
    await this.sqlServer.ejecutar(sql, { frecuencia, skEmpleado, fkVeo });
  }

  async eliminar(skEmpleado: number, fkVeo: number): Promise<void> {
    const sql = `
      DELETE FROM DIM_VEO_CARNET_SUKA
      WHERE fk_posicion = @skEmpleado AND fk_veo = @fkVeo
    `;
    await this.sqlServer.ejecutar(sql, { skEmpleado, fkVeo });
  }
}
