import { Injectable } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';
import { LoggerService } from '../../comun/logger/logger.service';
import { ConsultarHistorialIndicadoresDto } from './dto/consultar-historial-indicadores.dto';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';

export interface MovimientoIndicador {
  idRelacion: number;
  idInforme: number;
  folioJtrac: string;
  idInformeAnterior?: number;
  folioAnterior?: string;
  usuario: string;
  accion: 'ASIGNAR' | 'ACTUALIZAR' | 'ELIMINAR';
  origen: 'Individual' | 'Carga masiva';
}

@Injectable()
export class JtracPdiHistorialRepository {
  constructor(
    private readonly sql: SqlServerService,
    private readonly logger: LoggerService,
  ) {}

  async registrar(movimiento: MovimientoIndicador): Promise<void> {
    try {
      await this.sql.ejecutar(
        `INSERT INTO dbo.CI_JTRAC_PDI_HISTORIAL
        (id_relacion, id_informe, folio_jtrac, id_informe_anterior, folio_anterior, usuario, accion, origen, fecha)
        VALUES (@idRelacion, @idInforme, @folioJtrac, @idInformeAnterior, @folioAnterior, @usuario, @accion, @origen, SYSDATETIME())`,
        {
          ...movimiento,
          idInformeAnterior: movimiento.idInformeAnterior ?? null,
          folioAnterior: movimiento.folioAnterior ?? null,
        },
      );
    } catch (error) {
      this.logger.advertencia('No se guardó el historial del movimiento de indicadores', {
        ...movimiento,
        error: (error as Error).message,
      });
    }
  }

  async consultar(dto: ConsultarHistorialIndicadoresDto) {
    if (dto.fechaDesde && dto.fechaHasta && dto.fechaDesde > dto.fechaHasta) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'La fecha desde no puede ser posterior a la fecha hasta.',
        400,
      );
    }
    const condiciones: string[] = [];
    const parametros: Record<string, string | number> = {};
    if (dto.busqueda) {
      condiciones.push(`(usuario LIKE @busqueda ESCAPE '!' OR folio_jtrac LIKE @busqueda ESCAPE '!'
        OR folio_anterior LIKE @busqueda ESCAPE '!' OR CONVERT(varchar(20),id_informe) LIKE @busqueda ESCAPE '!'
        OR accion LIKE @busqueda ESCAPE '!' OR origen LIKE @busqueda ESCAPE '!')`);
      parametros.busqueda = this.patron(dto.busqueda);
    }
    if (dto.usuario) {
      condiciones.push("LOWER(usuario) LIKE LOWER(@usuario) ESCAPE '!'");
      parametros.usuario = this.patron(dto.usuario);
    }
    if (dto.accion) {
      condiciones.push('accion = @accion');
      parametros.accion = dto.accion;
    }
    if (dto.origen) {
      condiciones.push('origen = @origen');
      parametros.origen = dto.origen;
    }
    if (dto.informe !== undefined) {
      condiciones.push('id_informe = @informe');
      parametros.informe = dto.informe;
    }
    if (dto.folioJtrac) {
      condiciones.push("UPPER(folio_jtrac) LIKE UPPER(@folioJtrac) ESCAPE '!'");
      parametros.folioJtrac = this.patron(dto.folioJtrac);
    }
    if (dto.fechaDesde) {
      condiciones.push('fecha >= CONVERT(date, @fechaDesde, 23)');
      parametros.fechaDesde = dto.fechaDesde;
    }
    if (dto.fechaHasta) {
      condiciones.push('fecha < DATEADD(DAY, 1, CONVERT(date, @fechaHasta, 23))');
      parametros.fechaHasta = dto.fechaHasta;
    }
    const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const conteo = await this.sql.ejecutar<{ total: number }>(
      `SELECT COUNT(*) total FROM dbo.CI_JTRAC_PDI_HISTORIAL ${filtro}`,
      parametros,
    );
    const registros = await this.sql.ejecutar(
      `SELECT * FROM (
      SELECT id_movimiento AS idMovimiento, id_relacion AS idRelacion, id_informe AS idInforme,
        folio_jtrac AS folioJtrac, id_informe_anterior AS idInformeAnterior, folio_anterior AS folioAnterior,
        usuario, accion, origen, CONVERT(varchar(33),fecha,126) AS fecha,
        ROW_NUMBER() OVER (ORDER BY fecha DESC,id_movimiento DESC) rn
      FROM dbo.CI_JTRAC_PDI_HISTORIAL ${filtro}
      ) datos WHERE rn > @desde AND rn <= @hasta ORDER BY rn`,
      {
        ...parametros,
        desde: (dto.pagina - 1) * dto.tamanioPagina,
        hasta: dto.pagina * dto.tamanioPagina,
      },
    );
    return {
      registros,
      total: Number(conteo[0]?.total ?? 0),
      pagina: dto.pagina,
      tamanioPagina: dto.tamanioPagina,
    };
  }

  private patron(texto: string): string {
    return `%${texto.trim().replace(/[!%_\[\]]/g, '!$&')}%`;
  }
}
