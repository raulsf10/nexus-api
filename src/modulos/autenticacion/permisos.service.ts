import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { AutenticacionRepository } from './autenticacion.repository';
import { GuardarPermisosDto } from './dto/guardar-permisos.dto';
import { MODULO_ADMINISTRAR_PERMISOS, MODULOS_ADMINISTRABLES } from './permisos.constantes';
import { ConsultarUsuariosPermisosDto } from './dto/consultar-usuarios-permisos.dto';

@Injectable()
export class PermisosService {
  constructor(
    private readonly oracle: OracleService,
    private readonly autenticacion: AutenticacionRepository,
  ) {}

  async listarUsuarios(dto: ConsultarUsuariosPermisosDto) {
    const parametros: Record<string, unknown> = {};
    const modulos = MODULOS_ADMINISTRABLES.map(({ clave }, indice) => {
      parametros[`modulo${indice}`] = clave;
      return `:modulo${indice}`;
    }).join(', ');
    const filtro = `TRIM(usuario) IS NOT NULL AND modulo IN (${modulos})`;
    const conteo = await this.oracle.ejecutar<{ TOTAL: number }>(
      `SELECT COUNT(DISTINCT LOWER(TRIM(usuario))) AS total
       FROM dwh_suka.dim_ci_admin WHERE ${filtro}`,
      parametros,
    );
    const total = Number(conteo[0]?.TOTAL ?? 0);
    const tamanioPagina = dto.tamanioPagina ?? 25;
    const pagina = Math.min(dto.pagina ?? 1, Math.max(1, Math.ceil(total / tamanioPagina)));
    if (!total) return { registros: [], total, pagina, tamanioPagina };
    const filas = await this.oracle.ejecutar<{
      USUARIO: string;
      TOTAL_MODULOS: number;
      ULTIMO_ACCESO: string | null;
    }>(
      `SELECT usuario, total_modulos, ultimo_acceso FROM (
         SELECT LOWER(TRIM(usuario)) AS usuario,
                COUNT(DISTINCT modulo) AS total_modulos,
                TO_CHAR(MAX(ultimo_acceso), 'YYYY-MM-DD"T"HH24:MI:SS') AS ultimo_acceso,
                ROW_NUMBER() OVER (ORDER BY LOWER(TRIM(usuario))) AS rn
         FROM dwh_suka.dim_ci_admin
         WHERE ${filtro}
         GROUP BY LOWER(TRIM(usuario))
       ) WHERE rn > :desde AND rn <= :hasta ORDER BY rn`,
      { ...parametros, desde: (pagina - 1) * tamanioPagina, hasta: pagina * tamanioPagina },
    );
    return {
      registros: filas.map((fila) => ({
        usuario: fila.USUARIO,
        totalModulos: Number(fila.TOTAL_MODULOS),
        ultimoAcceso: fila.ULTIMO_ACCESO,
      })),
      total,
      pagina,
      tamanioPagina,
    };
  }

  async consultar(usuario: string) {
    const modulos = await this.autenticacion.obtenerModulosPorUsuario(usuario);
    await this.validarUsuario(usuario, modulos);
    return { usuario, modulos, catalogo: MODULOS_ADMINISTRABLES };
  }

  async guardar(dto: GuardarPermisosDto, actor: string) {
    const actuales = await this.autenticacion.obtenerModulosPorUsuario(dto.usuario);
    await this.validarUsuario(dto.usuario, actuales);
    if (
      actor.toLowerCase() === dto.usuario.toLowerCase() &&
      !dto.modulos.includes(MODULO_ADMINISTRAR_PERMISOS)
    ) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'No puedes quitarte el permiso para administrar usuarios.',
      );
    }
    await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
      // Serializa altas/bajas con otros administradores sin borrar permisos del sistema anterior.
      await ejecutor.ejecutar('LOCK TABLE dwh_suka.dim_ci_admin IN EXCLUSIVE MODE');
      const autorizados = await ejecutor.ejecutar(
        `SELECT usuario FROM dwh_suka.dim_ci_admin
        WHERE LOWER(usuario) = LOWER(:actor) AND modulo = :modulo`,
        { actor, modulo: MODULO_ADMINISTRAR_PERMISOS },
      );
      if (!autorizados.length)
        throw new ExcepcionNegocio(
          CodigosError.NO_AUTORIZADO,
          'Ya no tienes permiso para administrar usuarios.',
          403,
        );
      for (const { clave } of MODULOS_ADMINISTRABLES) {
        if (dto.modulos.includes(clave)) {
          await ejecutor.ejecutar(
            `INSERT INTO dwh_suka.dim_ci_admin (usuario, modulo, ultima_modificacion)
            SELECT :usuario, :modulo, SYSTIMESTAMP FROM dual WHERE NOT EXISTS (
              SELECT 1 FROM dwh_suka.dim_ci_admin WHERE LOWER(usuario) = LOWER(:usuario) AND modulo = :modulo)`,
            { usuario: dto.usuario, modulo: clave },
          );
        } else {
          await ejecutor.ejecutar(
            `DELETE FROM dwh_suka.dim_ci_admin
            WHERE LOWER(usuario) = LOWER(:usuario) AND modulo = :modulo`,
            { usuario: dto.usuario, modulo: clave },
          );
        }
      }
    });
    return {
      usuario: dto.usuario,
      modulos: await this.autenticacion.obtenerModulosPorUsuario(dto.usuario),
      catalogo: MODULOS_ADMINISTRABLES,
    };
  }

  private async validarUsuario(usuario: string, modulos: string[]): Promise<void> {
    if (modulos.length) return;
    const filas = await this.oracle.ejecutar(
      `SELECT sk_usuario_win FROM dwh_suka.dim_hk_usuarios_windows
      WHERE LOWER(TRIM(sk_usuario_win)) = LOWER(:usuario) AND ROWNUM = 1`,
      { usuario },
    );
    if (!filas.length)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'El usuario no existe en el catálogo de usuarios.',
        404,
      );
  }
}
