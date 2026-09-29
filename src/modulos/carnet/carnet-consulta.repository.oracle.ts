import { Injectable } from '@nestjs/common';
import { CarnetEstatusInstalacionEsquemaService } from '../../base-datos/oracle/carnet-estatus-instalacion-esquema.service';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { RegistroCarnetEntidad } from './entidades/registro-carnet.entidad';
import { ExcepcionesCarnetEsquemaService } from '../excepciones-carnet/excepciones-carnet-esquema.service';

type FilaOracle = Record<string, unknown>;

const TABLA_CARNET = 'dwh_suka.dim_veo_carnet';
const TABLA_INFORMES = 'dwh_suka.dim_veo';
const TABLA_POSICIONES = 'dwh_suka.stg_rh_posisiones_activas';
const TABLA_CATEGORIAS = 'dwh_suka.gob_ind_gpo_kdx';

function desdeCarnet(estatusDisponible: boolean): string {
  return `
    FROM ${TABLA_CARNET} vc
    LEFT JOIN ${TABLA_INFORMES} v ON vc.fk_veo = v.sk_veo
    LEFT JOIN ${TABLA_POSICIONES} pa ON vc.fk_posicion = pa.idobj
    LEFT JOIN ${TABLA_CATEGORIAS} go ON vc.fk_veo = go.sk_veo
    LEFT JOIN dwh_suka.dim_ci_jtrac_pdi jr ON jr.fk_veo = vc.fk_veo
    LEFT JOIN (
      SELECT DISTINCT UPPER(TRIM(folio_jtrac)) AS folio_jtrac,
        TRIM(nombre_entregable) AS nombre_indicador
      FROM dwh_suka.vw_base_fabrica_v2
    ) ji ON ji.folio_jtrac = jr.folio_jtrac
    ${
      estatusDisponible
        ? 'LEFT JOIN dwh_suka.dim_ci_carnet_estatus cei ON cei.fk_posicion = vc.fk_posicion AND cei.fk_veo = vc.fk_veo'
        : ''
    }
  `;
}

const CONDICION_BUSQUEDA = `
  (
    UPPER(pa.direccion) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(pa.area) LIKE '%' || UPPER(:busqueda) || '%'
    OR TO_CHAR(vc.fk_posicion) LIKE '%' || :busqueda || '%'
    OR TO_CHAR(pa.num_empleado) LIKE '%' || :busqueda || '%'
    OR UPPER(pa.denominacion_objeto) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(pa.nombre_completo) LIKE '%' || UPPER(:busqueda) || '%'
    OR TO_CHAR(vc.fk_veo) LIKE '%' || :busqueda || '%'
    OR UPPER(v.dsnombrelargo) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(go.agrupador) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(vc.frecuencia) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(jr.folio_jtrac) LIKE '%' || UPPER(:busqueda) || '%'
    OR UPPER(ji.nombre_indicador) LIKE '%' || UPPER(:busqueda) || '%'
    OR TO_CHAR(NVL(jr.fecha_actualizacion, jr.fecha_creacion), 'DD/MM/YYYY HH24:MI:SS') LIKE
      '%' || :busqueda || '%'
    OR TO_CHAR(vc.fechaalta) LIKE '%' || :busqueda || '%'
    OR TO_CHAR(TO_DATE(TO_CHAR(vc.fechaalta), 'YYYYMMDD'), 'DD/MM/YYYY') LIKE
      '%' || :busqueda || '%'
  )
`;

@Injectable()
export class CarnetConsultaRepositoryOracle {
  constructor(
    private readonly oracle: OracleService,
    private readonly esquemaEstatusInstalacion: CarnetEstatusInstalacionEsquemaService,
    private readonly esquemaExcepciones: ExcepcionesCarnetEsquemaService,
  ) {}

  async contar(busqueda?: string): Promise<number> {
    const estatusDisponible = await this.esquemaEstatusInstalacion.estaDisponible();
    const excepcionesDisponibles = await this.esquemaExcepciones.estaDisponible();
    const sql = `
      SELECT COUNT(*) AS total
      ${desdeCarnet(estatusDisponible)}
      ${this.clausulaFiltros(busqueda, estatusDisponible, excepcionesDisponibles)}
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql, this.parametrosFiltros(busqueda));
    return Number(filas[0]?.['TOTAL'] ?? 0);
  }

  async consultar(
    pagina: number,
    tamanioPagina: number,
    busqueda?: string,
  ): Promise<RegistroCarnetEntidad[]> {
    const desde = (pagina - 1) * tamanioPagina;
    const hasta = desde + tamanioPagina;
    const estatusDisponible = await this.esquemaEstatusInstalacion.estaDisponible();
    const excepcionesDisponibles = await this.esquemaExcepciones.estaDisponible();
    const columnaEstatus = estatusDisponible
      ? 'cei.estatus_instalacion AS estatus_instalacion'
      : 'CAST(NULL AS VARCHAR2(20)) AS estatus_instalacion';
    const sql = `
      SELECT
        empresa,
        direccion,
        id_posicion,
        numero_colaborador,
        puesto_plantilla,
        nombre_plantilla,
        id_informe,
        nombre_informe,
        categoria_pdi,
        frecuencia_uso,
        folio_jtrac,
        nombre_indicador,
        fecha_asignacion_indicador,
        estatus_instalacion,
        fecha_asignacion
      FROM (
        SELECT
          pa.direccion AS empresa,
          pa.area AS direccion,
          vc.fk_posicion AS id_posicion,
          pa.num_empleado AS numero_colaborador,
          pa.denominacion_objeto AS puesto_plantilla,
          pa.nombre_completo AS nombre_plantilla,
          vc.fk_veo AS id_informe,
          v.dsnombrelargo AS nombre_informe,
          go.agrupador AS categoria_pdi,
          vc.frecuencia AS frecuencia_uso,
          jr.folio_jtrac,
          ji.nombre_indicador,
          TO_CHAR(NVL(jr.fecha_actualizacion, jr.fecha_creacion), 'YYYY-MM-DD"T"HH24:MI:SS')
            AS fecha_asignacion_indicador,
          ${columnaEstatus},
          vc.fechaalta AS fecha_asignacion,
          ROW_NUMBER() OVER (
            ORDER BY vc.fechaalta ASC, vc.fk_veo ASC, vc.fk_posicion ASC, vc.sk_carnet ASC,
              jr.id_relacion NULLS LAST, ji.nombre_indicador NULLS LAST
          ) AS rn
        ${desdeCarnet(estatusDisponible)}
        ${this.clausulaFiltros(busqueda, estatusDisponible, excepcionesDisponibles)}
      )
      WHERE rn > :desde AND rn <= :hasta
      ORDER BY rn
    `;
    const filas = await this.oracle.ejecutar<FilaOracle>(sql, {
      ...this.parametrosFiltros(busqueda),
      desde,
      hasta,
    });
    return filas.map((fila) => this.mapear(fila));
  }

  private clausulaFiltros(
    busqueda: string | undefined,
    estatusDisponible: boolean,
    excepcionesDisponibles: boolean,
  ): string {
    const condiciones: string[] = [];
    if (busqueda) {
      const condicionEstatus = estatusDisponible
        ? "\n    OR UPPER(cei.estatus_instalacion) LIKE '%' || UPPER(:busqueda) || '%'"
        : '';
      condiciones.push(CONDICION_BUSQUEDA.replace('\n  )', `${condicionEstatus}\n  )`));
    }
    if (excepcionesDisponibles) {
      condiciones.push(`
        NOT EXISTS (
          SELECT 1
          FROM dwh_suka.dim_ci_carnet_excepciones cie
          WHERE cie.fk_veo = vc.fk_veo
            AND (cie.fk_posicion = vc.fk_posicion OR cie.fk_posicion IS NULL)
        )
      `);
    }
    return condiciones.length > 0 ? `WHERE ${condiciones.join('\n  AND ')}` : '';
  }

  private parametrosFiltros(busqueda: string | undefined): Record<string, string> {
    return busqueda ? { busqueda } : {};
  }

  private mapear(fila: FilaOracle): RegistroCarnetEntidad {
    return {
      empresa: this.texto(fila['EMPRESA']),
      direccion: this.texto(fila['DIRECCION']),
      idPosicion: Number(fila['ID_POSICION']),
      numeroColaborador: this.numero(fila['NUMERO_COLABORADOR']),
      puestoPlantilla: this.texto(fila['PUESTO_PLANTILLA']),
      nombrePlantilla: this.texto(fila['NOMBRE_PLANTILLA']),
      idInforme: Number(fila['ID_INFORME']),
      nombreInforme: this.texto(fila['NOMBRE_INFORME']),
      categoriaPdi: this.texto(fila['CATEGORIA_PDI']),
      frecuenciaUso: this.texto(fila['FRECUENCIA_USO']),
      folioJtrac: this.texto(fila['FOLIO_JTRAC']),
      nombreIndicador: this.texto(fila['NOMBRE_INDICADOR']),
      fechaAsignacionIndicador: this.fecha(fila['FECHA_ASIGNACION_INDICADOR']),
      estatusInstalacion: this.texto(fila['ESTATUS_INSTALACION']),
      fechaAsignacion: this.fecha(fila['FECHA_ASIGNACION']),
    };
  }

  private texto(valor: unknown): string | null {
    if (valor === null || valor === undefined) {
      return null;
    }
    const texto = String(valor).trim();
    return texto.length > 0 ? texto : null;
  }

  private numero(valor: unknown): number | null {
    if (valor === null || valor === undefined) {
      return null;
    }
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  private fecha(valor: unknown): string | null {
    if (valor === null || valor === undefined) {
      return null;
    }
    if (valor instanceof Date) {
      return valor.toISOString();
    }
    const fechaCompacta = this.texto(valor);
    if (fechaCompacta && /^\d{8}$/.test(fechaCompacta)) {
      return `${fechaCompacta.slice(0, 4)}-${fechaCompacta.slice(4, 6)}-${fechaCompacta.slice(6, 8)}`;
    }
    return fechaCompacta;
  }
}
