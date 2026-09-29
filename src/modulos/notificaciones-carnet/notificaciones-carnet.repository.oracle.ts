import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';

@Injectable()
export class NotificacionesCarnetRepositoryOracle {
  constructor(private readonly oracle: OracleService) {}

  async destinatariosInforme(idInforme: number) {
    return this.oracle.ejecutar<{
      ID_POSICION: number;
      NOMBRE: string | null;
      CORREO: string | null;
      EXCLUIDA: number;
    }>(
      `
      SELECT a.fk_posicion AS id_posicion, p.nombre, c.correo,
        CASE WHEN EXISTS (
          SELECT 1 FROM dwh_suka.dim_ci_carnet_excepciones e
          WHERE e.fk_veo=:idInforme AND (e.fk_posicion IS NULL OR e.fk_posicion=a.fk_posicion)
        ) THEN 1 ELSE 0 END AS excluida
      FROM (SELECT DISTINCT fk_posicion FROM dwh_suka.dim_veo_carnet
        WHERE fk_veo=:idInforme AND fk_posicion IS NOT NULL) a
      LEFT JOIN (SELECT idobj, MAX(nombre_completo) nombre
        FROM dwh_suka.stg_rh_posisiones_activas GROUP BY idobj) p ON p.idobj=a.fk_posicion
      LEFT JOIN dwh_suka.stg_rh_vw_ctl_plantillacorreo c ON TRIM(c.posicion)=TO_CHAR(a.fk_posicion)
      ORDER BY a.fk_posicion`,
      { idInforme },
    );
  }

  async informesAsignados(idPosicion: number): Promise<Set<number>> {
    const filas = await this.oracle.ejecutar<{ FK_VEO: number }>(
      'SELECT fk_veo FROM dwh_suka.dim_veo_carnet WHERE fk_posicion=:idPosicion',
      { idPosicion },
    );
    return new Set(filas.map((fila) => fila.FK_VEO));
  }

  async identificadoresAsignados(idPosicion: number): Promise<Map<number, string>> {
    const filas = await this.oracle.ejecutar<{ FK_VEO: number; ID_CARNET: string }>(
      'SELECT fk_veo, TO_CHAR(sk_carnet) AS id_carnet FROM dwh_suka.dim_veo_carnet WHERE fk_posicion=:idPosicion',
      { idPosicion },
    );
    return new Map(filas.map((fila) => [fila.FK_VEO, fila.ID_CARNET]));
  }

  async obtenerCorreoPorPosicion(idPosicion: number): Promise<string | null> {
    const filas = await this.oracle.ejecutar<{ CORREO?: unknown }>(
      `
        SELECT correo
        FROM dwh_suka.stg_rh_vw_ctl_plantillacorreo
        WHERE posicion = :idPosicion
          AND correo IS NOT NULL
          AND ROWNUM = 1
      `,
      { idPosicion: String(idPosicion) },
    );
    const correo = filas[0]?.CORREO;
    return typeof correo === 'string' && correo.trim().length > 0 ? correo.trim() : null;
  }
}
