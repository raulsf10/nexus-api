import { Injectable } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';
import { AccionHistorial } from './enums/accion-historial.enum';
import { OrigenHistorial } from './enums/origen-historial.enum';
import { HistorialCarnetEntidad, RegistroHistorial } from './entidades/historial-carnet.entidad';

interface FiltrosConsulta {
  usuario?: string;
  accion?: string;
  origen?: string;
  informe?: number;
  posicion?: number;
  fechaDesde?: string;
  fechaHasta?: string;
}

type FilaSql = Record<string, unknown>;

const TABLA = 'DIM_CI_CARNET_HISTORIAL';

@Injectable()
export class HistorialCarnetRepository {
  constructor(private readonly sqlServer: SqlServerService) {}

  // Los nombres llegan ya resueltos (snapshot); esta BD no conoce los catálogos.
  async registrar(datos: RegistroHistorial): Promise<void> {
    const sql = `
      INSERT INTO ${TABLA}
        (usuario, accion, fk_posicion, fk_veo, nombre_posicion, nombre_informe,
         frecuencia, origen, fecha)
      VALUES
        (@usuario, @accion, @fkPosicion, @fkVeo, @nombrePosicion, @nombreInforme,
         @frecuencia, @origen, GETDATE())
    `;
    await this.sqlServer.ejecutar(sql, {
      usuario: datos.usuario,
      accion: datos.accion,
      fkPosicion: datos.fkPosicion,
      fkVeo: datos.fkVeo,
      nombrePosicion: datos.nombrePosicion,
      nombreInforme: datos.nombreInforme,
      frecuencia: datos.frecuencia ?? null,
      origen: datos.origen,
    });
  }

  async contar(filtros: FiltrosConsulta): Promise<number> {
    const { where, parametros } = this.construirFiltros(filtros);
    const sql = `SELECT COUNT(*) AS total FROM ${TABLA} ${where}`;
    const filas = await this.sqlServer.ejecutar<{ total: number }>(sql, parametros);
    return Number(filas[0]?.['total'] ?? 0);
  }

  async consultar(
    filtros: FiltrosConsulta,
    pagina: number,
    tamanioPagina: number,
  ): Promise<HistorialCarnetEntidad[]> {
    const { where, parametros } = this.construirFiltros(filtros);
    const desde = (pagina - 1) * tamanioPagina;
    const hasta = desde + tamanioPagina;

    const sql = `
      SELECT * FROM (
        SELECT
          id_historial, usuario, accion, fk_posicion, fk_veo,
          nombre_posicion, nombre_informe, frecuencia, origen,
          CONVERT(varchar(19), fecha, 126) AS fecha_txt,
          ROW_NUMBER() OVER (ORDER BY fecha DESC, id_historial DESC) AS rn
        FROM ${TABLA}
        ${where}
      ) t
      WHERE t.rn > @desde AND t.rn <= @hasta
      ORDER BY t.rn
    `;
    const filas = await this.sqlServer.ejecutar<FilaSql>(sql, { ...parametros, desde, hasta });
    return filas.map((r) => this.mapear(r));
  }

  private construirFiltros(filtros: FiltrosConsulta): {
    where: string;
    parametros: Record<string, unknown>;
  } {
    const condiciones: string[] = [];
    const parametros: Record<string, unknown> = {};

    if (filtros.usuario && filtros.usuario.trim().length > 0) {
      condiciones.push(`LOWER(usuario) LIKE '%' + LOWER(@usuario) + '%'`);
      parametros['usuario'] = filtros.usuario.trim();
    }
    if (filtros.accion && filtros.accion.trim().length > 0) {
      condiciones.push('accion = @accion');
      parametros['accion'] = filtros.accion;
    }
    if (filtros.origen && filtros.origen.trim().length > 0) {
      condiciones.push('origen = @origen');
      parametros['origen'] = filtros.origen;
    }
    if (filtros.informe !== undefined) {
      condiciones.push('fk_veo = @informe');
      parametros['informe'] = filtros.informe;
    }
    if (filtros.posicion !== undefined) {
      condiciones.push('fk_posicion = @posicion');
      parametros['posicion'] = filtros.posicion;
    }
    if (filtros.fechaDesde) {
      condiciones.push('fecha >= CONVERT(date, @fechaDesde)');
      parametros['fechaDesde'] = filtros.fechaDesde;
    }
    if (filtros.fechaHasta) {
      // < fechaHasta + 1 día para incluir todo el día indicado.
      condiciones.push('fecha < DATEADD(DAY, 1, CONVERT(date, @fechaHasta))');
      parametros['fechaHasta'] = filtros.fechaHasta;
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
    return { where, parametros };
  }

  private mapear(r: FilaSql): HistorialCarnetEntidad {
    return {
      idHistorial: Number(r['id_historial']),
      usuario: String(r['usuario'] ?? '').trim(),
      accion: String(r['accion'] ?? '') as AccionHistorial,
      fkPosicion: Number(r['fk_posicion']),
      fkVeo: Number(r['fk_veo']),
      nombrePosicion: r['nombre_posicion'] ? String(r['nombre_posicion']).trim() : null,
      nombreInforme: r['nombre_informe'] ? String(r['nombre_informe']).trim() : null,
      frecuencia: r['frecuencia'] ? String(r['frecuencia']).trim() : null,
      origen: String(r['origen'] ?? '') as OrigenHistorial,
      fecha: String(r['fecha_txt'] ?? ''),
    };
  }
}
