import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { UsuarioListadoEntidad } from './entidades/usuario-listado.entidad';

type FilaUsuario = Record<string, unknown>;

@Injectable()
export class UsuariosRepository {
  constructor(private readonly oracle: OracleService) {}

  async buscarPorTexto(texto: string): Promise<UsuarioListadoEntidad[]> {
    // "posición" en el dominio = sk_empleado (lo que usa dim_veo_carnet.fk_posicion).
    // Se busca por descripción, sk_empleado e idempleado para soportar texto y números.
    const sql = `
      SELECT * FROM (
        SELECT DISTINCT dim.sk_empleado, dim.idempleado, dim.descripcion, dim.puesto, dim.pseunonimo, win.sk_usuario_win
        FROM dwh_suka.dim_hk_usuarios dim
        LEFT JOIN dwh_suka.dim_hk_usuarios_windows win ON dim.sk_empleado = win.fk_empleado
        WHERE (UPPER(dim.descripcion) LIKE UPPER('%' || :texto || '%')
               OR TO_CHAR(dim.sk_empleado) LIKE '%' || :texto || '%'
               OR TO_CHAR(dim.idempleado) LIKE '%' || :texto || '%')
          AND dim.puesto IS NOT NULL
          AND dim.descripcion IS NOT NULL
        ORDER BY dim.descripcion
      ) WHERE ROWNUM <= 50
    `;
    const filas = await this.oracle.ejecutar<FilaUsuario>(sql, { texto });
    return filas.map((r) => this.mapearFila(r));
  }

  async obtenerPorSkEmpleado(skEmpleado: number): Promise<UsuarioListadoEntidad | null> {
    const sql = `
      SELECT DISTINCT dim.sk_empleado, dim.idempleado, dim.descripcion, dim.puesto, dim.pseunonimo, win.sk_usuario_win
      FROM dwh_suka.dim_hk_usuarios dim
      LEFT JOIN dwh_suka.dim_hk_usuarios_windows win ON dim.sk_empleado = win.fk_empleado
      WHERE dim.sk_empleado = :skEmpleado
    `;
    const filas = await this.oracle.ejecutar<FilaUsuario>(sql, { skEmpleado });
    return filas.length > 0 ? this.mapearFila(filas[0]) : null;
  }

  private mapearFila(r: FilaUsuario): UsuarioListadoEntidad {
    return {
      skEmpleado: Number(r['SK_EMPLEADO']),
      idEmpleado: Number(r['IDEMPLEADO']),
      descripcion: String(r['DESCRIPCION'] ?? '').trim(),
      puesto: String(r['PUESTO'] ?? '').trim(),
      pseudonimo: r['PSEUNONIMO'] ? String(r['PSEUNONIMO']).trim() : null,
      usuarioWin: r['SK_USUARIO_WIN'] ? String(r['SK_USUARIO_WIN']).trim() : null,
    };
  }
}
