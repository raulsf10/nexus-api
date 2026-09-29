import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { ExcepcionCarnetEntidad, ReglaExcepcionCarnet } from './entidades/excepcion-carnet.entidad';

type FilaOracle = Record<string, unknown>;

const TABLA_EXCEPCION = 'dwh_suka.dim_ci_carnet_excepciones';
const SECUENCIA_EXCEPCION = 'dwh_suka.seq_ci_carnet_excepciones';

@Injectable()
export class ExcepcionesCarnetRepository {
  constructor(private readonly oracle: OracleService) {}

  async obtenerReglas(): Promise<ReglaExcepcionCarnet[]> {
    const filas = await this.oracle.ejecutar<FilaOracle>(`
      SELECT fk_posicion, fk_veo
      FROM ${TABLA_EXCEPCION}
    `);
    return filas.map((fila) => ({
      idPosicion: this.numeroOpcional(fila, 'FK_POSICION'),
      idInforme: this.numero(fila, 'FK_VEO'),
    }));
  }

  async contar(busqueda?: string): Promise<number> {
    const { where, parametros } = this.construirBusqueda(busqueda);
    const filas = await this.oracle.ejecutar<{ TOTAL?: unknown }>(
      `SELECT COUNT(*) AS total FROM ${TABLA_EXCEPCION} ${where}`,
      parametros,
    );
    return Number(filas[0]?.['TOTAL'] ?? 0);
  }

  async consultar(
    pagina: number,
    tamanioPagina: number,
    busqueda?: string,
  ): Promise<ExcepcionCarnetEntidad[]> {
    const { where, parametros } = this.construirBusqueda(busqueda);
    const desde = (pagina - 1) * tamanioPagina;
    const filas = await this.oracle.ejecutar<FilaOracle>(
      `
      SELECT
        id_excepcion,
        fk_posicion,
        fk_veo,
        comentario,
        usuario_creacion,
        fecha_creacion,
        usuario_actualizacion,
        fecha_actualizacion
      FROM (
        SELECT
          id_excepcion,
          fk_posicion,
          fk_veo,
          comentario,
          usuario_creacion,
          TO_CHAR(fecha_creacion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_creacion,
          usuario_actualizacion,
          TO_CHAR(fecha_actualizacion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_actualizacion,
          ROW_NUMBER() OVER (ORDER BY fecha_creacion DESC, id_excepcion DESC) AS rn
        FROM ${TABLA_EXCEPCION}
        ${where}
      )
      WHERE rn > :desde AND rn <= :hasta
      ORDER BY rn
    `,
      { ...parametros, desde, hasta: desde + tamanioPagina },
    );
    return filas.map((fila) => this.mapear(fila));
  }

  async existeRegla(
    idPosicion: number | null,
    idInforme: number,
    idExcepcionExcluir?: number,
  ): Promise<boolean> {
    const parametros: Record<string, number | null> = { idPosicion, idInforme };
    if (idExcepcionExcluir !== undefined) {
      parametros['idExcepcionExcluir'] = idExcepcionExcluir;
    }
    const filas = await this.oracle.ejecutar<FilaOracle>(
      `
      SELECT 1
      FROM ${TABLA_EXCEPCION}
      WHERE fk_veo = :idInforme
        AND (fk_posicion = :idPosicion OR (fk_posicion IS NULL AND :idPosicion IS NULL))
        ${idExcepcionExcluir === undefined ? '' : 'AND id_excepcion <> :idExcepcionExcluir'}
        AND ROWNUM = 1
    `,
      parametros,
    );
    return filas.length > 0;
  }

  async crear(
    idPosicion: number | null,
    idInforme: number,
    comentario: string | null,
    usuario: string,
  ): Promise<number> {
    const secuencia = await this.oracle.ejecutar<{ ID_EXCEPCION?: unknown }>(
      `SELECT ${SECUENCIA_EXCEPCION}.NEXTVAL AS id_excepcion FROM dual`,
    );
    const idExcepcion = Number(secuencia[0]?.['ID_EXCEPCION']);
    await this.oracle.ejecutar(
      `
      INSERT INTO ${TABLA_EXCEPCION} (
        id_excepcion, fk_posicion, fk_veo, comentario,
        usuario_creacion, fecha_creacion, usuario_actualizacion, fecha_actualizacion
      )
      VALUES (
        :idExcepcion, :idPosicion, :idInforme, :comentario,
        :usuario, SYSDATE, NULL, NULL
      )
    `,
      { idExcepcion, idPosicion, idInforme, comentario, usuario },
    );
    return idExcepcion;
  }

  async existe(idExcepcion: number): Promise<boolean> {
    const filas = await this.oracle.ejecutar<FilaOracle>(
      `
      SELECT 1
      FROM ${TABLA_EXCEPCION}
      WHERE id_excepcion = :idExcepcion AND ROWNUM = 1
    `,
      { idExcepcion },
    );
    return filas.length > 0;
  }

  async actualizar(
    idExcepcion: number,
    idPosicion: number | null,
    idInforme: number,
    comentario: string | null,
    usuario: string,
  ): Promise<void> {
    await this.oracle.ejecutar(
      `
      UPDATE ${TABLA_EXCEPCION}
      SET fk_posicion = :idPosicion,
          fk_veo = :idInforme,
          comentario = :comentario,
          usuario_actualizacion = :usuario,
          fecha_actualizacion = SYSDATE
      WHERE id_excepcion = :idExcepcion
    `,
      { idExcepcion, idPosicion, idInforme, comentario, usuario },
    );
  }

  async eliminar(idExcepcion: number): Promise<void> {
    await this.oracle.ejecutar(`DELETE FROM ${TABLA_EXCEPCION} WHERE id_excepcion = :idExcepcion`, {
      idExcepcion,
    });
  }

  private construirBusqueda(busqueda?: string): {
    where: string;
    parametros: Record<string, string>;
  } {
    if (!busqueda) {
      return { where: '', parametros: {} };
    }
    return {
      where: `
        WHERE (
          TO_CHAR(id_excepcion) LIKE '%' || :busqueda || '%'
          OR TO_CHAR(fk_posicion) LIKE '%' || :busqueda || '%'
          OR TO_CHAR(fk_veo) LIKE '%' || :busqueda || '%'
          OR UPPER(NVL(comentario, '')) LIKE '%' || UPPER(:busqueda) || '%'
          OR UPPER(usuario_creacion) LIKE '%' || UPPER(:busqueda) || '%'
          OR UPPER(NVL(usuario_actualizacion, '')) LIKE '%' || UPPER(:busqueda) || '%'
          OR TO_CHAR(fecha_creacion, 'DD/MM/YYYY') LIKE '%' || :busqueda || '%'
        )
      `,
      parametros: { busqueda },
    };
  }

  private mapear(fila: FilaOracle): ExcepcionCarnetEntidad {
    return {
      idExcepcion: this.numero(fila, 'ID_EXCEPCION'),
      idPosicion: this.numeroOpcional(fila, 'FK_POSICION'),
      idInforme: this.numero(fila, 'FK_VEO'),
      comentario: this.texto(fila, 'COMENTARIO'),
      usuarioCreacion: this.texto(fila, 'USUARIO_CREACION') ?? '',
      fechaCreacion: this.texto(fila, 'FECHA_CREACION') ?? '',
      usuarioActualizacion: this.texto(fila, 'USUARIO_ACTUALIZACION'),
      fechaActualizacion: this.texto(fila, 'FECHA_ACTUALIZACION'),
    };
  }

  private numero(fila: FilaOracle, columna: string): number {
    return Number(fila[columna]);
  }

  private numeroOpcional(fila: FilaOracle, columna: string): number | null {
    const valor = fila[columna];
    return valor === null || valor === undefined ? null : Number(valor);
  }

  private texto(fila: FilaOracle, columna: string): string | null {
    const valor = fila[columna];
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto || null;
  }
}
