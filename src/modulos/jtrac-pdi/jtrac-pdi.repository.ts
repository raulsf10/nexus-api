import { Injectable } from '@nestjs/common';
import { JtracPdiHistorialRepository, MovimientoIndicador } from './jtrac-pdi-historial.repository';
import { OracleService, EjecutorOracle } from '../../base-datos/oracle/oracle.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import {
  ConsultarRelacionesJtracDto,
  ConsultarReporteJtracDto,
  GuardarRelacionJtracDto,
} from './dto/jtrac-pdi.dto';
import { FilaReporteJtracPdi, RelacionJtracPdi } from './entidades/jtrac-pdi.entidad';

type FilaOracle = Record<string, unknown>;

@Injectable()
export class JtracPdiRepository {
  constructor(
    private readonly oracle: OracleService,
    private readonly historial: JtracPdiHistorialRepository,
  ) {}

  async estadoEsquema() {
    const filas = await this.oracle.ejecutar<{ COLUMNAS: number; SECUENCIA: number }>(`
      SELECT (SELECT COUNT(*) FROM all_tab_columns WHERE owner='DWH_SUKA'
        AND table_name='DIM_CI_JTRAC_PDI' AND column_name IN ('ID_RELACION','FOLIO_JTRAC','FK_VEO',
          'USUARIO_CREACION','FECHA_CREACION','USUARIO_ACTUALIZACION','FECHA_ACTUALIZACION')) AS columnas,
        (SELECT COUNT(*) FROM all_sequences WHERE sequence_owner='DWH_SUKA'
          AND sequence_name='SEQ_CI_JTRAC_PDI') AS secuencia FROM dual`);
    return {
      tablaDisponible: Number(filas[0]?.COLUMNAS) === 7,
      secuenciaDisponible: Number(filas[0]?.SECUENCIA) > 0,
    };
  }

  async buscarFolios(busqueda: string): Promise<Array<{ folioJtrac: string }>> {
    const filas = await this.oracle.ejecutar<{ FOLIO_JTRAC: string }>(
      `
      SELECT folio_jtrac FROM (
        SELECT DISTINCT UPPER(REGEXP_REPLACE(folio_jtrac,'^[[:space:]]+|[[:space:]]+$','')) AS folio_jtrac
        FROM dwh_suka.vw_base_fabrica_v2
        WHERE REGEXP_REPLACE(folio_jtrac,'^[[:space:]]+|[[:space:]]+$','') IS NOT NULL AND
          (UPPER(folio_jtrac) LIKE :busqueda ESCAPE '\\'
           OR UPPER(nombre_entregable) LIKE :busqueda ESCAPE '\\')
        ORDER BY folio_jtrac
      ) WHERE ROWNUM <= 20`,
      { busqueda: this.patron(busqueda) },
    );
    return filas.map((fila) => ({ folioJtrac: fila.FOLIO_JTRAC }));
  }

  async indicadores(folioJtrac: string): Promise<{ existe: boolean; indicadores: string[] }> {
    const filas = await this.oracle.ejecutar<{ INDICADOR: string | null }>(
      `
      SELECT DISTINCT TRIM(nombre_entregable) AS indicador FROM dwh_suka.vw_base_fabrica_v2
      WHERE UPPER(REGEXP_REPLACE(folio_jtrac,'^[[:space:]]+|[[:space:]]+$',''))=:folioJtrac ORDER BY indicador`,
      { folioJtrac },
    );
    return {
      existe: filas.length > 0,
      indicadores: filas.map((fila) => fila.INDICADOR).filter((valor): valor is string => !!valor),
    };
  }

  async consultar(dto: ConsultarRelacionesJtracDto) {
    const filtro = dto.busqueda
      ? `WHERE (TO_CHAR(r.fk_veo) LIKE :busqueda ESCAPE '\\'
      OR UPPER(v.dsnombrelargo) LIKE :busqueda ESCAPE '\\'
      OR UPPER(r.folio_jtrac) LIKE :busqueda ESCAPE '\\'
      OR UPPER(r.usuario_creacion) LIKE :busqueda ESCAPE '\\'
      OR UPPER(r.usuario_actualizacion) LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(r.fecha_creacion,'DD/MM/YYYY HH24:MI:SS') LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(r.fecha_actualizacion,'DD/MM/YYYY HH24:MI:SS') LIKE :busqueda ESCAPE '\\')`
      : '';
    const parametros = dto.busqueda ? { busqueda: this.patron(dto.busqueda) } : {};
    const desde = `FROM dwh_suka.dim_ci_jtrac_pdi r
      LEFT JOIN dwh_suka.dim_veo v ON v.sk_veo=r.fk_veo ${filtro}`;
    const conteo = await this.oracle.ejecutar<{ TOTAL: number }>(
      `SELECT COUNT(*) total ${desde}`,
      parametros,
    );
    const total = Number(conteo[0]?.TOTAL ?? 0);
    const filas = total
      ? await this.oracle.ejecutar<FilaOracle>(
          `
      SELECT * FROM (
        SELECT r.id_relacion,r.fk_veo,v.dsnombrelargo,r.folio_jtrac,r.usuario_creacion,
          TO_CHAR(r.fecha_creacion,'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_creacion,
          r.usuario_actualizacion,
          TO_CHAR(r.fecha_actualizacion,'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_actualizacion,
          ROW_NUMBER() OVER (ORDER BY r.fecha_creacion DESC,r.id_relacion DESC) rn ${desde}
      ) WHERE rn > :desde AND rn <= :hasta ORDER BY rn`,
          { ...parametros, ...this.limites(dto) },
        )
      : [];
    return {
      registros: filas.map((fila) => this.mapearRelacion(fila)),
      total,
      pagina: dto.pagina,
      tamanioPagina: dto.tamanioPagina,
    };
  }

  async crear(dto: GuardarRelacionJtracDto, usuario: string): Promise<number> {
    const id = await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      await this.verificarDuplicado(ejecutor, dto);
      const filas = await ejecutor.ejecutar<{ ID: number }>(
        'SELECT dwh_suka.seq_ci_jtrac_pdi.NEXTVAL AS id FROM dual',
      );
      const idRelacion = Number(filas[0].ID);
      await ejecutor.ejecutar(
        `INSERT INTO dwh_suka.dim_ci_jtrac_pdi
        (id_relacion,folio_jtrac,fk_veo,usuario_creacion,fecha_creacion)
        VALUES (:idRelacion,:folioJtrac,:idInforme,:usuario,SYSDATE)`,
        { idRelacion, folioJtrac: dto.folioJtrac, idInforme: dto.idInforme, usuario },
      );
      return idRelacion;
    });
    await this.historial.registrar({
      ...dto,
      idRelacion: id,
      usuario,
      accion: 'ASIGNAR',
      origen: 'Individual',
    });
    return id;
  }

  async actualizar(
    idRelacion: number,
    dto: GuardarRelacionJtracDto,
    usuario: string,
  ): Promise<void> {
    let movimiento: MovimientoIndicador | undefined;
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      const actual = await this.bloquearRelacion(ejecutor, idRelacion);
      if (Number(actual.FK_VEO) === dto.idInforme && actual.FOLIO_JTRAC === dto.folioJtrac) return;
      await this.verificarDuplicado(ejecutor, dto, idRelacion);
      await ejecutor.ejecutar(
        `UPDATE dwh_suka.dim_ci_jtrac_pdi
        SET folio_jtrac=:folioJtrac,fk_veo=:idInforme,usuario_actualizacion=:usuario,
          fecha_actualizacion=SYSDATE WHERE id_relacion=:idRelacion`,
        { idRelacion, folioJtrac: dto.folioJtrac, idInforme: dto.idInforme, usuario },
      );
      movimiento = {
        ...dto,
        idRelacion,
        usuario,
        accion: 'ACTUALIZAR',
        origen: 'Individual',
        idInformeAnterior: Number(actual.FK_VEO),
        folioAnterior: String(actual.FOLIO_JTRAC),
      };
    });
    if (movimiento) await this.historial.registrar(movimiento);
  }

  async eliminar(idRelacion: number, usuario: string): Promise<void> {
    let movimiento: MovimientoIndicador | undefined;
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      const actual = await this.bloquearRelacion(ejecutor, idRelacion);
      await ejecutor.ejecutar(
        'DELETE FROM dwh_suka.dim_ci_jtrac_pdi WHERE id_relacion=:idRelacion',
        { idRelacion },
      );
      movimiento = {
        idRelacion,
        usuario,
        accion: 'ELIMINAR',
        origen: 'Individual',
        idInforme: Number(actual.FK_VEO),
        folioJtrac: String(actual.FOLIO_JTRAC),
      };
    });
    if (movimiento) await this.historial.registrar(movimiento);
  }

  async encontrarRelacion(
    dto: GuardarRelacionJtracDto,
    ejecutor: EjecutorOracle = this.oracle,
    bloquear = false,
  ): Promise<number | null> {
    const filas = await ejecutor.ejecutar<{ ID_RELACION: number }>(
      `SELECT id_relacion FROM dwh_suka.dim_ci_jtrac_pdi
        WHERE fk_veo=:idInforme AND UPPER(TRIM(folio_jtrac))=:folioJtrac ${bloquear ? 'FOR UPDATE' : ''}`,
      { idInforme: dto.idInforme, folioJtrac: dto.folioJtrac },
    );
    return filas.length ? Number(filas[0].ID_RELACION) : null;
  }

  async aplicarLote(
    filas: GuardarRelacionJtracDto[],
    eliminar: boolean,
    usuario: string,
  ): Promise<void> {
    const movimientos = await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      const cambios: MovimientoIndicador[] = [];
      for (const fila of filas) {
        let idRelacion = await this.encontrarRelacion(fila, ejecutor, true);
        if ((eliminar && idRelacion === null) || (!eliminar && idRelacion !== null)) {
          throw new ExcepcionNegocio(
            CodigosError.VALIDACION,
            'Las relaciones cambiaron. Vuelve a validar el archivo.',
            409,
          );
        }
        if (eliminar) {
          await ejecutor.ejecutar(
            'DELETE FROM dwh_suka.dim_ci_jtrac_pdi WHERE id_relacion=:idRelacion',
            { idRelacion },
          );
        } else {
          const secuencia = await ejecutor.ejecutar<{ ID: number }>(
            'SELECT dwh_suka.seq_ci_jtrac_pdi.NEXTVAL id FROM dual',
          );
          idRelacion = Number(secuencia[0].ID);
          await ejecutor.ejecutar(
            `INSERT INTO dwh_suka.dim_ci_jtrac_pdi
            (id_relacion,folio_jtrac,fk_veo,usuario_creacion,fecha_creacion)
            VALUES (:idRelacion,:folioJtrac,:idInforme,:usuario,SYSDATE)`,
            { ...fila, idRelacion, usuario },
          );
        }
        cambios.push({
          ...fila,
          idRelacion: idRelacion!,
          usuario,
          accion: eliminar ? 'ELIMINAR' : 'ASIGNAR',
          origen: 'Carga masiva',
        });
      }
      return cambios;
    });
    for (const movimiento of movimientos) await this.historial.registrar(movimiento);
  }

  async reporte(dto: ConsultarReporteJtracDto) {
    const busqueda = dto.busqueda
      ? `AND (
      UPPER(pa.direccion) LIKE :busqueda ESCAPE '\\'
      OR UPPER(pa.area) LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(vc.fk_posicion) LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(pa.num_empleado) LIKE :busqueda ESCAPE '\\'
      OR UPPER(pa.denominacion_objeto) LIKE :busqueda ESCAPE '\\'
      OR UPPER(pa.nombre_completo) LIKE :busqueda ESCAPE '\\'
      OR 'RPD' LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(vc.fk_veo) LIKE :busqueda ESCAPE '\\'
      OR UPPER(v.dsnombrelargo) LIKE :busqueda ESCAPE '\\'
      OR UPPER(vc.frecuencia) LIKE :busqueda ESCAPE '\\'
      OR UPPER(r.folio_jtrac) LIKE :busqueda ESCAPE '\\'
      OR UPPER(f.nombre_entregable) LIKE :busqueda ESCAPE '\\'
      OR UPPER(NVL(r.usuario_actualizacion,r.usuario_creacion)) LIKE :busqueda ESCAPE '\\'
      OR TO_CHAR(NVL(r.fecha_actualizacion,r.fecha_creacion),'DD/MM/YYYY HH24:MI:SS') LIKE :busqueda ESCAPE '\\')`
      : '';
    // DISTINCT evita multiplicar indicadores cuando la vista de fabrica repite el mismo entregable.
    const consulta = `SELECT DISTINCT vc.fk_posicion,vc.fk_veo,v.dsnombrelargo,r.id_relacion,
      pa.direccion AS empresa,pa.area AS direccion,
      pa.num_empleado,pa.nombre_completo,pa.denominacion_objeto,vc.frecuencia,
      r.folio_jtrac,TRIM(f.nombre_entregable) AS indicador,
      NVL(r.usuario_actualizacion,r.usuario_creacion) AS usuario_creacion,
      TO_CHAR(NVL(r.fecha_actualizacion,r.fecha_creacion),'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_relacion
      FROM dwh_suka.dim_veo_carnet vc
      LEFT JOIN dwh_suka.dim_veo v ON v.sk_veo=vc.fk_veo
      LEFT JOIN (SELECT idobj,direccion,area,num_empleado,nombre_completo,denominacion_objeto FROM (
        SELECT p.*, ROW_NUMBER() OVER (PARTITION BY idobj ORDER BY num_empleado,nombre_completo,denominacion_objeto,direccion,area) fila
        FROM dwh_suka.stg_rh_posisiones_activas p) WHERE fila=1) pa ON pa.idobj=vc.fk_posicion
      INNER JOIN dwh_suka.dim_ci_jtrac_pdi r ON r.fk_veo=vc.fk_veo
      LEFT JOIN dwh_suka.vw_base_fabrica_v2 f
        ON UPPER(REGEXP_REPLACE(f.folio_jtrac,'^[[:space:]]+|[[:space:]]+$',''))=r.folio_jtrac
      WHERE ${dto.idPosicion === undefined ? '1=1' : 'vc.fk_posicion=:idPosicion'}
        AND NOT EXISTS (SELECT 1 FROM dwh_suka.dim_ci_carnet_excepciones e
          WHERE e.fk_veo=vc.fk_veo AND (e.fk_posicion IS NULL OR e.fk_posicion=vc.fk_posicion))
      ${busqueda}`;
    const parametros = {
      ...(dto.idPosicion === undefined ? {} : { idPosicion: dto.idPosicion }),
      ...(dto.busqueda ? { busqueda: this.patron(dto.busqueda) } : {}),
    };
    const conteo = await this.oracle.ejecutar<{ TOTAL: number }>(
      `SELECT COUNT(*) total FROM (${consulta})`,
      parametros,
    );
    const total = Number(conteo[0]?.TOTAL ?? 0);
    const filas = total
      ? await this.oracle.ejecutar<FilaOracle>(
          `
      SELECT * FROM (SELECT datos.*,ROW_NUMBER() OVER
        (ORDER BY fk_posicion,fk_veo,folio_jtrac NULLS LAST,indicador NULLS LAST,id_relacion,frecuencia NULLS LAST) rn
        FROM (${consulta}) datos)
      WHERE rn > :desde AND rn <= :hasta ORDER BY rn`,
          { ...parametros, ...this.limites(dto) },
        )
      : [];
    return {
      registros: filas.map((fila) => this.mapearReporte(fila)),
      total,
      pagina: dto.pagina,
      tamanioPagina: dto.tamanioPagina,
    };
  }

  private async verificarDuplicado(
    ejecutor: EjecutorOracle,
    dto: GuardarRelacionJtracDto,
    idExcluir?: number,
  ) {
    const filas = await ejecutor.ejecutar(
      `SELECT 1 FROM dwh_suka.dim_ci_jtrac_pdi
      WHERE fk_veo=:idInforme AND UPPER(TRIM(folio_jtrac))=:folioJtrac
      ${idExcluir === undefined ? '' : 'AND id_relacion<>:idExcluir'} AND ROWNUM=1`,
      {
        idInforme: dto.idInforme,
        folioJtrac: dto.folioJtrac,
        ...(idExcluir === undefined ? {} : { idExcluir }),
      },
    );
    if (filas.length)
      throw new ExcepcionNegocio(
        CodigosError.RELACION_JTRAC_DUPLICADA,
        'Este PDI ya está relacionado con ese folio JTRAC.',
        409,
      );
  }

  private async bloquearRelacion(
    ejecutor: EjecutorOracle,
    idRelacion: number,
  ): Promise<FilaOracle> {
    const filas = await ejecutor.ejecutar<FilaOracle>(
      `SELECT id_relacion,fk_veo,folio_jtrac
      FROM dwh_suka.dim_ci_jtrac_pdi WHERE id_relacion=:idRelacion FOR UPDATE`,
      { idRelacion },
    );
    if (!filas.length)
      throw new ExcepcionNegocio(
        CodigosError.RELACION_JTRAC_NO_ENCONTRADA,
        'La relación ya no existe. Actualiza el listado.',
        404,
      );
    return filas[0];
  }

  private limites(dto: ConsultarRelacionesJtracDto) {
    return { desde: (dto.pagina - 1) * dto.tamanioPagina, hasta: dto.pagina * dto.tamanioPagina };
  }

  private patron(texto: string): string {
    return `%${texto.toUpperCase().replace(/[\\%_]/g, '\\$&')}%`;
  }
  private texto(valor: unknown): string | null {
    return valor == null ? null : String(valor).trim() || null;
  }

  private mapearRelacion(fila: FilaOracle): RelacionJtracPdi {
    return {
      idRelacion: Number(fila.ID_RELACION),
      idInforme: Number(fila.FK_VEO),
      nombreInforme: this.texto(fila.DSNOMBRELARGO) ?? '',
      folioJtrac: String(fila.FOLIO_JTRAC),
      usuarioCreacion: String(fila.USUARIO_CREACION),
      fechaCreacion: String(fila.FECHA_CREACION),
      usuarioActualizacion: this.texto(fila.USUARIO_ACTUALIZACION),
      fechaActualizacion: this.texto(fila.FECHA_ACTUALIZACION),
    };
  }

  private mapearReporte(fila: FilaOracle): FilaReporteJtracPdi {
    return {
      empresa: this.texto(fila.EMPRESA),
      direccion: this.texto(fila.DIRECCION),
      idPosicion: Number(fila.FK_POSICION),
      numeroColaborador: this.texto(fila.NUM_EMPLEADO),
      nombrePlantilla: this.texto(fila.NOMBRE_COMPLETO),
      puestoPlantilla: this.texto(fila.DENOMINACION_OBJETO),
      categoria: 'RPD',
      idInforme: Number(fila.FK_VEO),
      nombreInforme: this.texto(fila.DSNOMBRELARGO) ?? '',
      frecuencia: this.texto(fila.FRECUENCIA),
      idRelacion: fila.ID_RELACION == null ? null : Number(fila.ID_RELACION),
      folioJtrac: this.texto(fila.FOLIO_JTRAC),
      indicador: this.texto(fila.INDICADOR),
      fechaRelacion: this.texto(fila.FECHA_RELACION),
      usuarioRelacion: this.texto(fila.USUARIO_CREACION),
    };
  }
}
