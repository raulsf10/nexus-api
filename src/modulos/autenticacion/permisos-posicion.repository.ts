import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';

export interface PermisoPosicion {
  idPosicion: number;
  modulo: string;
}

@Injectable()
export class PermisosPosicionRepository {
  constructor(
    private readonly oracle: OracleService,
    private readonly sql: SqlServerService,
  ) {}

  async posicionesUsuario(usuario: string): Promise<number[]> {
    const filas = await this.oracle.ejecutar<{ ID_POSICION: number }>(
      `SELECT DISTINCT w.fk_empleado id_posicion FROM dwh_suka.dim_hk_usuarios_windows w
       WHERE LOWER(TRIM(w.sk_usuario_win))=LOWER(:usuario)
       AND EXISTS (SELECT 1 FROM dwh_suka.stg_rh_posisiones_activas p WHERE p.idobj=w.fk_empleado)`,
      { usuario },
    );
    return filas.map((fila) => Number(fila.ID_POSICION));
  }

  async obtenerTodos(): Promise<PermisoPosicion[]> {
    return this.sql.ejecutar<PermisoPosicion>(
      `IF OBJECT_ID('dbo.CI_PERMISO_POSICION','U') IS NULL
         SELECT CAST(NULL AS BIGINT) idPosicion, CAST(NULL AS NVARCHAR(100)) modulo WHERE 1=0;
       ELSE SELECT id_posicion idPosicion, modulo FROM dbo.CI_PERMISO_POSICION`,
    );
  }

  async obtenerPorUsuario(usuario: string): Promise<PermisoPosicion[]> {
    const permisos = await this.obtenerTodos();
    if (!permisos.length) return [];
    const posiciones = new Set(await this.posicionesUsuario(usuario));
    return permisos.filter((permiso) => posiciones.has(Number(permiso.idPosicion)));
  }

  async obtenerPosicion(idPosicion: number) {
    const filas = await this.oracle.ejecutar<{ NOMBRE: string | null; PUESTO: string | null }>(
      `SELECT nombre_completo nombre, denominacion_objeto puesto
       FROM dwh_suka.stg_rh_posisiones_activas WHERE idobj=:idPosicion AND ROWNUM=1`,
      { idPosicion },
    );
    if (!filas.length) return null;
    const cuentas = await this.oracle.ejecutar<{ USUARIO: string }>(
      `SELECT DISTINCT LOWER(TRIM(sk_usuario_win)) usuario FROM dwh_suka.dim_hk_usuarios_windows
       WHERE fk_empleado=:idPosicion AND TRIM(sk_usuario_win) IS NOT NULL ORDER BY usuario`,
      { idPosicion },
    );
    return {
      idPosicion,
      nombre: filas[0].NOMBRE,
      puesto: filas[0].PUESTO,
      ocupantes: cuentas.map((fila) => fila.USUARIO),
    };
  }

  async listar(
    pagina: number,
    tamanioPagina: number,
  ): Promise<{
    registros: {
      usuario: string;
      idPosicion: number;
      totalModulos: number;
      ultimoAcceso: null;
      fechaActualizacion: Date;
    }[];
    total: number;
    pagina: number;
    tamanioPagina: number;
  }> {
    const filas = await this.sql.ejecutar<{
      idPosicion: number;
      totalModulos: number;
      fechaActualizacion: Date;
      total: number;
    }>(
      `WITH posiciones AS (
        SELECT id_posicion, COUNT(*) totalModulos, MAX(fecha_actualizacion) fechaActualizacion
        FROM dbo.CI_PERMISO_POSICION GROUP BY id_posicion
      ), numeradas AS (SELECT *, ROW_NUMBER() OVER (ORDER BY id_posicion) rn FROM posiciones)
      SELECT p.id_posicion idPosicion, p.totalModulos, p.fechaActualizacion, conteo.total
      FROM (SELECT COUNT(*) total FROM posiciones) conteo
      LEFT JOIN (SELECT * FROM numeradas WHERE rn>@desde AND rn<=@hasta) p ON 1=1
      ORDER BY p.rn`,
      { desde: (pagina - 1) * tamanioPagina, hasta: pagina * tamanioPagina },
    );
    const total = Number(filas[0]?.total ?? 0);
    const ultimaPagina = Math.max(1, Math.ceil(total / tamanioPagina));
    if (total && pagina > ultimaPagina) return this.listar(ultimaPagina, tamanioPagina);
    return {
      registros: filas
        .filter((fila) => fila.idPosicion != null)
        .map((fila) => ({
          usuario: String(fila.idPosicion),
          idPosicion: Number(fila.idPosicion),
          totalModulos: fila.totalModulos,
          ultimoAcceso: null,
          fechaActualizacion: fila.fechaActualizacion,
        })),
      total,
      pagina: Math.min(pagina, ultimaPagina),
      tamanioPagina,
    };
  }

  async guardar(
    idPosicion: number,
    modulos: string[],
    actor: string,
    validar: (actuales: PermisoPosicion[]) => Promise<void>,
  ): Promise<void> {
    await this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      const actuales = await ejecutar<PermisoPosicion>(
        'SELECT id_posicion idPosicion, modulo FROM dbo.CI_PERMISO_POSICION WITH (TABLOCKX, HOLDLOCK)',
      );
      await validar(actuales);
      await ejecutar('DELETE FROM dbo.CI_PERMISO_POSICION WHERE id_posicion=@idPosicion', {
        idPosicion,
      });
      for (const modulo of modulos) {
        await ejecutar(
          `INSERT INTO dbo.CI_PERMISO_POSICION (id_posicion,modulo,usuario_actualizacion,fecha_actualizacion)
           VALUES (@idPosicion,@modulo,@actor,GETDATE())`,
          { idPosicion, modulo, actor },
        );
      }
    });
  }
}
