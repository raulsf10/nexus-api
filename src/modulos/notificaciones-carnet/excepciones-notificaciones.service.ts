import { Injectable } from '@nestjs/common';
import { SqlServerService } from '../../base-datos/sql-server/sql-server.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { InformesRepository } from '../informes/informes.repository';
import { ConsultarExcepcionesCarnetDto } from '../excepciones-carnet/dto/consultar-excepciones-carnet.dto';

interface ExcepcionNotificacion {
  idInforme: number;
  usuarioCreacion: string;
  fechaCreacion: string;
}

@Injectable()
export class ExcepcionesNotificacionesService {
  constructor(
    private readonly sql: SqlServerService,
    private readonly informes: InformesRepository,
  ) {}

  // Sin caché: una excepción nueva también debe detener avisos que ya están en cola.
  async obtenerIds(): Promise<Set<number>> {
    const filas = await this.sql.ejecutar<{ idInforme: number }>(
      'SELECT id_informe AS idInforme FROM dbo.CI_CARNET_EXCEPCION_CORREO',
    );
    return new Set(filas.map((fila) => Number(fila.idInforme)));
  }

  async permitidos(ids: number[]): Promise<number[]> {
    if (!ids.length) return [];
    const excluidos = await this.obtenerIds();
    return [...new Set(ids)].filter((id) => !excluidos.has(id));
  }

  async exigirPermitido(idInforme: number): Promise<void> {
    if (!(await this.permitidos([idInforme])).length) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Este informe tiene una excepción de notificaciones y no permite enviar correos.',
        409,
      );
    }
  }

  async consultar(dto: ConsultarExcepcionesCarnetDto) {
    const filas = await this.sql.ejecutar<ExcepcionNotificacion>(
      `SELECT id_informe AS idInforme, usuario_creacion AS usuarioCreacion,
        CONVERT(VARCHAR(19), fecha_creacion, 126) AS fechaCreacion
       FROM dbo.CI_CARNET_EXCEPCION_CORREO ORDER BY fecha_creacion DESC, id_informe`,
    );
    const nombres = new Map(
      (await this.informes.obtenerPorIds(filas.map((fila) => Number(fila.idInforme)))).map(
        (informe) => [informe.skVeo, informe.nombre],
      ),
    );
    const busqueda = (dto.busqueda ?? '').toLocaleLowerCase('es');
    const registros = filas
      .map((fila) => ({
        ...fila,
        idInforme: Number(fila.idInforme),
        nombreInforme: nombres.get(Number(fila.idInforme)) ?? '',
      }))
      .filter((fila) =>
        `${fila.idInforme} ${fila.nombreInforme} ${fila.usuarioCreacion}`
          .toLocaleLowerCase('es')
          .includes(busqueda),
      );
    const tamanioPagina = dto.tamanioPagina ?? 25;
    const pagina = Math.min(
      dto.pagina ?? 1,
      Math.max(1, Math.ceil(registros.length / tamanioPagina)),
    );
    const inicio = (pagina - 1) * tamanioPagina;
    return {
      registros: registros.slice(inicio, inicio + tamanioPagina),
      total: registros.length,
      pagina,
      tamanioPagina,
    };
  }

  async crear(idInforme: number, usuario: string): Promise<void> {
    if (!(await this.informes.obtenerPorSkVeo(idInforme))) {
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El informe no existe.', 404);
    }
    await this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      const filas = await ejecutar(
        `INSERT INTO dbo.CI_CARNET_EXCEPCION_CORREO (id_informe, usuario_creacion)
         OUTPUT inserted.id_informe
         SELECT @idInforme, @usuario
         WHERE NOT EXISTS (SELECT 1 FROM dbo.CI_CARNET_EXCEPCION_CORREO WITH (UPDLOCK, HOLDLOCK)
                           WHERE id_informe=@idInforme)`,
        { idInforme, usuario },
      );
      if (!filas.length) {
        throw new ExcepcionNegocio(
          CodigosError.EXCEPCION_DUPLICADA,
          'El informe ya tiene una excepción de notificaciones.',
          409,
        );
      }
    });
  }

  async eliminar(idInforme: number): Promise<void> {
    const filas = await this.sql.ejecutar(
      `DELETE FROM dbo.CI_CARNET_EXCEPCION_CORREO OUTPUT deleted.id_informe
       WHERE id_informe=@idInforme`,
      { idInforme },
    );
    if (!filas.length) {
      throw new ExcepcionNegocio(
        CodigosError.EXCEPCION_NO_ENCONTRADA,
        'La excepción no existe.',
        404,
      );
    }
  }
}
