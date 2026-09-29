import { Injectable } from '@nestjs/common';
import { CarnetEstatusInstalacionEsquemaService } from '../../base-datos/oracle/carnet-estatus-instalacion-esquema.service';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { InformeAsignadoEntidad, InformeEntidad } from './entidades/informe.entidad';

type FilaOracle = Record<string, unknown>;

@Injectable()
export class InformesRepository {
  constructor(
    private readonly oracle: OracleService,
    private readonly esquemaEstatusInstalacion: CarnetEstatusInstalacionEsquemaService,
  ) {}

  async buscar(filtro: string): Promise<InformeEntidad[]> {
    const sql = `
      SELECT * FROM (
        SELECT sk_veo, dsnombrelargo
        FROM dwh_suka.dim_veo
        WHERE LOWER(TO_CHAR(sk_veo) || LOWER(dsnombrelargo)) LIKE LOWER('%' || :filtro || '%')
        ORDER BY dsnombrelargo
      ) WHERE ROWNUM <= 50
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql, { filtro });
    return filas.map((r) => ({
      skVeo: Number(r['SK_VEO']),
      nombre: String(r['DSNOMBRELARGO'] ?? '').trim(),
    }));
  }

  async obtenerListadoPorUsuario(skEmpleado: number): Promise<InformeAsignadoEntidad[]> {
    const estatusDisponible = await this.esquemaEstatusInstalacion.estaDisponible();
    const estatusInstalacion = estatusDisponible
      ? 'cei.estatus_instalacion'
      : 'CAST(NULL AS VARCHAR2(20)) AS estatus_instalacion';
    const relacionEstatus = estatusDisponible
      ? `
        LEFT JOIN dwh_suka.dim_ci_carnet_estatus cei
          ON cei.fk_posicion = fac.fk_posicion AND cei.fk_veo = fac.fk_veo
      `
      : '';
    const sql = `
      SELECT fac.fk_veo, dim.dsnombrelargo, fac.activo, fac.frecuencia, ${estatusInstalacion}
      FROM dwh_suka.dim_veo_carnet fac
      INNER JOIN dwh_suka.dim_veo dim ON dim.sk_veo = fac.fk_veo
      ${relacionEstatus}
      WHERE fac.fk_posicion = :skEmpleado
      ORDER BY dim.dsnombrelargo
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql, { skEmpleado });
    return filas.map((r) => ({
      fkVeo: Number(r['FK_VEO']),
      nombre: String(r['DSNOMBRELARGO'] ?? '').trim(),
      activo: Number(r['ACTIVO'] ?? 0),
      frecuencia: r['FRECUENCIA'] ? String(r['FRECUENCIA']).trim() : null,
      estatusInstalacion: r['ESTATUS_INSTALACION'] ? String(r['ESTATUS_INSTALACION']).trim() : null,
    }));
  }

  async obtenerPorSkVeo(skVeo: number): Promise<InformeEntidad | null> {
    const sql = `
      SELECT sk_veo, dsnombrelargo
      FROM dwh_suka.dim_veo
      WHERE sk_veo = :skVeo
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql, { skVeo });
    if (filas.length === 0) return null;
    const r = filas[0];
    return {
      skVeo: Number(r['SK_VEO']),
      nombre: String(r['DSNOMBRELARGO'] ?? '').trim(),
    };
  }

  async obtenerFrecuenciasDisponibles(): Promise<string[]> {
    const sql = `
      SELECT DISTINCT frecuencia
      FROM dwh_suka.dim_veo_carnet
      WHERE frecuencia IS NOT NULL
      ORDER BY frecuencia
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql);
    return filas.map((r) => String(r['FRECUENCIA'] ?? '').trim()).filter((s) => s.length > 0);
  }
}
