import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { UsuarioListadoEntidad } from './entidades/usuario-listado.entidad';

type FilaUsuario = Record<string, unknown>;

@Injectable()
export class UsuariosRepository {
  constructor(private readonly oracle: OracleService) {}

  async buscarPorTexto(texto: string): Promise<UsuarioListadoEntidad[]> {
    const sql = `
      SELECT * FROM (
        SELECT DISTINCT pos.IDOBJ, pos.NUM_EMPLEADO, pos.NOMBRE_COMPLETO, pos.DENOMINACION_OBJETO, win.sk_usuario_win
        FROM dwh_suka.STG_RH_POSISIONES_ACTIVAS pos
        LEFT JOIN dwh_suka.dim_hk_usuarios_windows win ON pos.IDOBJ = win.fk_empleado
        WHERE (UPPER(pos.NOMBRE_COMPLETO) LIKE UPPER('%' || :texto || '%')
               OR TO_CHAR(pos.IDOBJ) LIKE '%' || :texto || '%'
               OR TO_CHAR(pos.NUM_EMPLEADO) LIKE '%' || :texto || '%')
          AND pos.DENOMINACION_OBJETO IS NOT NULL
          AND pos.NOMBRE_COMPLETO IS NOT NULL
        ORDER BY pos.NOMBRE_COMPLETO
      ) WHERE ROWNUM <= 50
    `;
    const filas = await this.oracle.ejecutar<FilaUsuario>(sql, { texto });
    return filas.map((r) => this.mapearFila(r));
  }

  async obtenerPorSkEmpleado(skEmpleado: number): Promise<UsuarioListadoEntidad | null> {
    const sql = `
      SELECT DISTINCT pos.IDOBJ, pos.NUM_EMPLEADO, pos.NOMBRE_COMPLETO, pos.DENOMINACION_OBJETO, win.sk_usuario_win
      FROM dwh_suka.STG_RH_POSISIONES_ACTIVAS pos
      LEFT JOIN dwh_suka.dim_hk_usuarios_windows win ON pos.IDOBJ = win.fk_empleado
      WHERE pos.IDOBJ = :skEmpleado
    `;
    const filas = await this.oracle.ejecutar<FilaUsuario>(sql, { skEmpleado });
    return filas.length > 0 ? this.mapearFila(filas[0]) : null;
  }

  private mapearFila(r: FilaUsuario): UsuarioListadoEntidad {
    return {
      skEmpleado: Number(r['IDOBJ']),
      idEmpleado: Number(r['NUM_EMPLEADO']),
      descripcion: String(r['NOMBRE_COMPLETO'] ?? '').trim(),
      puesto: String(r['DENOMINACION_OBJETO'] ?? '').trim(),
      usuarioWin: r['SK_USUARIO_WIN'] ? String(r['SK_USUARIO_WIN']).trim() : null,
    };
  }
}
