import { Injectable } from '@nestjs/common';
import { AjusteFilaSolicitudDto } from './dto/revisar-solicitud-carnet.dto';
import { OperacionCarga } from '../carga-masiva/enums/operacion-carga.enum';
import {
  EjecutorSqlServer,
  SqlServerService,
} from '../../base-datos/sql-server/sql-server.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import {
  EstadoFilaSolicitudCarnet,
  EstadoSolicitudCarnet,
} from './enums/estado-solicitud-carnet.enum';
import {
  ArchivoSolicitudCarnetEntidad,
  DatosArchivosSolicitud,
  FilaSolicitudCarnetEntidad,
  FilaSolicitudNueva,
  SolicitudCarnetDetalleEntidad,
  SolicitudCarnetResumenEntidad,
  VersionPendienteRevision,
  VersionSolicitudCarnetEntidad,
} from './entidades/solicitud-carnet.entidad';

type FilaSql = Record<string, unknown>;

const TABLA_SOLICITUD = 'dbo.CI_SOLICITUD_CARNET';
const TABLA_VERSION = 'dbo.CI_SOLICITUD_CARNET_VERSION';
const TABLA_FILA = 'dbo.CI_SOLICITUD_CARNET_FILA';

@Injectable()
export class SolicitudesCarnetRepository {
  constructor(private readonly sqlServer: SqlServerService) {}

  async crearSolicitud(
    usuario: string,
    operacion: OperacionCarga,
    comentario: string | null,
    archivos: DatosArchivosSolicitud,
    filas: FilaSolicitudNueva[],
  ): Promise<{ idSolicitud: number; idVersion: number }> {
    await this.asegurarCamposRevision();
    return this.sqlServer.ejecutarEnTransaccion(async (ejecutar) => {
      const solicitudes = await ejecutar<{ idSolicitud: number }>(
        `
        INSERT INTO ${TABLA_SOLICITUD} (usuario_solicitante, operacion, estado, fecha_creacion, fecha_cierre)
        OUTPUT INSERTED.id_solicitud AS idSolicitud
        VALUES (@usuario, @operacion, @estado, SYSDATETIME(), NULL)
      `,
        { usuario, operacion, estado: EstadoSolicitudCarnet.PENDIENTE_REVISION },
      );
      const idSolicitud = Number(solicitudes[0]?.['idSolicitud']);
      if (!Number.isInteger(idSolicitud)) {
        throw new ExcepcionNegocio(
          CodigosError.SQL_SERVER_ERROR,
          'No se pudo crear la solicitud.',
          500,
        );
      }

      const idVersion = await this.insertarVersion(ejecutar, idSolicitud, 1, comentario, archivos);
      await this.insertarFilas(ejecutar, idVersion, filas);
      return { idSolicitud, idVersion };
    });
  }

  async crearNuevaVersion(
    idSolicitud: number,
    usuario: string,
    comentario: string | null,
    archivos: DatosArchivosSolicitud,
    filas: FilaSolicitudNueva[],
  ): Promise<{ idSolicitud: number; idVersion: number }> {
    await this.asegurarCamposRevision();
    return this.sqlServer.ejecutarEnTransaccion(async (ejecutar) => {
      const solicitudes = await ejecutar<{ idSolicitud: number }>(
        `
        UPDATE ${TABLA_SOLICITUD}
        SET estado = @estadoPendiente, fecha_cierre = NULL, fecha_limite_aceptacion = NULL,
            usuario_cierre = NULL, motivo_cierre = NULL
        OUTPUT INSERTED.id_solicitud AS idSolicitud
        WHERE id_solicitud = @idSolicitud
          AND usuario_solicitante = @usuario
          AND estado = @estadoParcial
          AND (fecha_limite_aceptacion IS NULL OR fecha_limite_aceptacion > SYSDATETIME())
      `,
        {
          idSolicitud,
          usuario,
          estadoPendiente: EstadoSolicitudCarnet.PENDIENTE_REVISION,
          estadoParcial: EstadoSolicitudCarnet.APROBADA_PARCIAL,
        },
      );
      if (solicitudes.length === 0) {
        throw new ExcepcionNegocio(
          CodigosError.SOLICITUD_ESTADO_INVALIDO,
          'Solo se puede cargar una nueva versión para una solicitud parcialmente aprobada propia.',
          409,
        );
      }

      const numeros = await ejecutar<{ numeroVersion: number }>(
        `
        SELECT ISNULL(MAX(numero_version), 0) + 1 AS numeroVersion
        FROM ${TABLA_VERSION} WITH (UPDLOCK, HOLDLOCK)
        WHERE fk_solicitud = @idSolicitud
      `,
        { idSolicitud },
      );
      const numeroVersion = Number(numeros[0]?.['numeroVersion']);
      const idVersion = await this.insertarVersion(
        ejecutar,
        idSolicitud,
        numeroVersion,
        comentario,
        archivos,
      );
      await this.insertarFilas(ejecutar, idVersion, filas);
      return { idSolicitud, idVersion };
    });
  }

  async contar(usuarioSolicitante?: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS total
      FROM ${TABLA_SOLICITUD}
      ${usuarioSolicitante ? 'WHERE usuario_solicitante = @usuarioSolicitante' : ''}
    `;
    const filas = await this.sqlServer.ejecutar<{ total: number }>(sql, { usuarioSolicitante });
    return Number(filas[0]?.['total'] ?? 0);
  }

  async consultar(
    pagina: number,
    tamanioPagina: number,
    usuarioSolicitante?: string,
  ): Promise<SolicitudCarnetResumenEntidad[]> {
    const desde = (pagina - 1) * tamanioPagina;
    const sql = `
      SELECT * FROM (
        SELECT
          s.id_solicitud AS idSolicitud,
          s.operacion,
          s.usuario_solicitante AS usuarioSolicitante,
          s.estado,
          CONVERT(varchar(33), s.fecha_creacion, 126) AS fechaCreacion,
          CONVERT(varchar(33), s.fecha_cierre, 126) AS fechaCierre,
          COUNT(v.id_version) AS totalVersiones,
          ROW_NUMBER() OVER (ORDER BY s.fecha_creacion DESC, s.id_solicitud DESC) AS rn
        FROM ${TABLA_SOLICITUD} s
        LEFT JOIN ${TABLA_VERSION} v ON v.fk_solicitud = s.id_solicitud
        ${usuarioSolicitante ? 'WHERE s.usuario_solicitante = @usuarioSolicitante' : ''}
        GROUP BY s.id_solicitud, s.operacion, s.usuario_solicitante, s.estado, s.fecha_creacion, s.fecha_cierre
      ) consulta
      WHERE consulta.rn > @desde AND consulta.rn <= @hasta
      ORDER BY consulta.rn
    `;
    const filas = await this.sqlServer.ejecutar<FilaSql>(sql, {
      usuarioSolicitante,
      desde,
      hasta: desde + tamanioPagina,
    });
    return filas.map((fila) => this.mapearResumen(fila));
  }

  async obtenerDetalle(idSolicitud: number): Promise<SolicitudCarnetDetalleEntidad | null> {
    const columnasRevision = await this.columnasRevision();
    const columnasCierre = (await this.cierreDisponible())
      ? 'CONVERT(varchar(33), fecha_limite_aceptacion, 126) AS fechaLimiteAceptacion, usuario_cierre AS usuarioCierre, motivo_cierre AS motivoCierre'
      : 'NULL AS fechaLimiteAceptacion, NULL AS usuarioCierre, NULL AS motivoCierre';
    const solicitudes = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        id_solicitud AS idSolicitud,
        operacion,
        usuario_solicitante AS usuarioSolicitante,
        estado,
        CONVERT(varchar(33), fecha_creacion, 126) AS fechaCreacion,
        CONVERT(varchar(33), fecha_cierre, 126) AS fechaCierre
        , ${columnasCierre}
      FROM ${TABLA_SOLICITUD}
      WHERE id_solicitud = @idSolicitud
    `,
      { idSolicitud },
    );
    const solicitud = solicitudes[0];
    if (!solicitud) return null;

    const versiones = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        id_version AS idVersion,
        numero_version AS numeroVersion,
        estado,
        comentario_solicitante AS comentarioSolicitante,
        comentario_revision AS comentarioRevision,
        usuario_revisor AS usuarioRevisor,
        CONVERT(varchar(33), fecha_creacion, 126) AS fechaCreacion,
        CONVERT(varchar(33), fecha_revision, 126) AS fechaRevision,
        archivo_solicitud_nombre AS archivoSolicitudNombre,
        vobo_nombre AS voboNombre
      FROM ${TABLA_VERSION}
      WHERE fk_solicitud = @idSolicitud
      ORDER BY numero_version ASC
    `,
      { idSolicitud },
    );

    const filas = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        fk_version AS idVersion,
        id_fila AS idFila,
        numero_fila AS numeroFila,
        id_posicion AS idPosicion,
        id_informe AS idInforme,
        frecuencia,
        ${columnasRevision},
        nombre_posicion AS nombrePosicion,
        nombre_informe AS nombreInforme,
        estado
      FROM ${TABLA_FILA}
      WHERE fk_version IN (SELECT id_version FROM ${TABLA_VERSION} WHERE fk_solicitud = @idSolicitud)
      ORDER BY fk_version ASC, numero_fila ASC, id_fila ASC
    `,
      { idSolicitud },
    );
    const filasPorVersion = new Map<number, FilaSolicitudCarnetEntidad[]>();
    for (const fila of filas) {
      const idVersion = this.numero(fila, 'idVersion');
      const actuales = filasPorVersion.get(idVersion) ?? [];
      actuales.push(this.mapearFila(fila));
      filasPorVersion.set(idVersion, actuales);
    }

    const detalle = this.mapearResumen(solicitud);
    return {
      ...detalle,
      totalVersiones: versiones.length,
      versiones: versiones.map((version) => this.mapearVersion(version, filasPorVersion)),
    };
  }

  async obtenerVersionPendiente(idVersion: number): Promise<VersionPendienteRevision | null> {
    const columnasRevision = await this.columnasRevision();
    const versiones = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        s.id_solicitud AS idSolicitud,
        s.operacion,
        s.usuario_solicitante AS usuarioSolicitante,
        v.id_version AS idVersion,
        v.estado
      FROM ${TABLA_VERSION} v
      INNER JOIN ${TABLA_SOLICITUD} s ON s.id_solicitud = v.fk_solicitud
      WHERE v.id_version = @idVersion
    `,
      { idVersion },
    );
    const version = versiones[0];
    if (!version) return null;
    const filas = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        id_fila AS idFila,
        numero_fila AS numeroFila,
        id_posicion AS idPosicion,
        id_informe AS idInforme,
        frecuencia,
        ${columnasRevision},
        nombre_posicion AS nombrePosicion,
        nombre_informe AS nombreInforme,
        estado
      FROM ${TABLA_FILA}
      WHERE fk_version = @idVersion AND estado = @estadoPendiente
      ORDER BY numero_fila ASC, id_fila ASC
    `,
      { idVersion, estadoPendiente: EstadoFilaSolicitudCarnet.PENDIENTE },
    );
    return {
      idSolicitud: this.numero(version, 'idSolicitud'),
      operacion: this.texto(version, 'operacion') as OperacionCarga,
      idVersion: this.numero(version, 'idVersion'),
      usuarioSolicitante: this.texto(version, 'usuarioSolicitante') ?? '',
      estado: this.texto(version, 'estado') as EstadoSolicitudCarnet,
      filas: filas.map((fila) => this.mapearFila(fila)),
    };
  }

  async registrarRevision(
    idSolicitud: number,
    idVersion: number,
    usuarioRevisor: string,
    filasAprobadas: number[],
    comentario: string | null,
    aplicarCambios: () => Promise<void>,
    ajustes: AjusteFilaSolicitudDto[] = [],
  ): Promise<EstadoSolicitudCarnet> {
    await this.asegurarCamposRevision();
    const estado =
      filasAprobadas.length === 0
        ? EstadoSolicitudCarnet.RECHAZADA
        : EstadoSolicitudCarnet.APROBADA_PARCIAL;

    return this.sqlServer.ejecutarEnTransaccion(async (ejecutar) => {
      const version = await ejecutar(
        `SELECT id_version FROM ${TABLA_VERSION} WITH (UPDLOCK, HOLDLOCK)
         WHERE id_version = @idVersion AND fk_solicitud = @idSolicitud AND estado = @estado`,
        { idVersion, idSolicitud, estado: EstadoSolicitudCarnet.PENDIENTE_REVISION },
      );
      if (version.length === 0) {
        throw new ExcepcionNegocio(
          CodigosError.SOLICITUD_ESTADO_INVALIDO,
          'La versión ya fue revisada.',
          409,
        );
      }
      const filas = await ejecutar<FilaSql>(
        `
        SELECT id_fila AS idFila
        FROM ${TABLA_FILA}
        WHERE fk_version = @idVersion AND estado = @estadoPendiente
        ORDER BY id_fila
      `,
        { idVersion, estadoPendiente: EstadoFilaSolicitudCarnet.PENDIENTE },
      );
      if (filas.length === 0) {
        throw new ExcepcionNegocio(
          CodigosError.SOLICITUD_ESTADO_INVALIDO,
          'La versión ya fue revisada o no tiene filas pendientes.',
          409,
        );
      }

      const idsPendientes = new Set(filas.map((fila) => this.numero(fila, 'idFila')));
      if (filasAprobadas.some((id) => !idsPendientes.has(id))) {
        throw new ExcepcionNegocio(CodigosError.VALIDACION, 'La selección ya no es válida.', 409);
      }
      const todosAprobados = filasAprobadas.length === idsPendientes.size;
      const estadoFinal = todosAprobados ? EstadoSolicitudCarnet.APROBADA : estado;

      for (const idFila of filasAprobadas) {
        const ajuste = ajustes.find((fila) => fila.idFila === idFila);
        const actualizadas = await ejecutar<{ idFila: number }>(
          `
          UPDATE ${TABLA_FILA}
          SET estado = @estadoAprobada,
              frecuencia_aprobada = COALESCE(@frecuencia, frecuencia),
              estatus_aprobado = COALESCE(@estatus, estatus_instalacion)
          OUTPUT INSERTED.id_fila AS idFila
          WHERE id_fila = @idFila
            AND fk_version = @idVersion
            AND estado = @estadoPendiente
        `,
          {
            idFila,
            idVersion,
            frecuencia: ajuste?.frecuencia ?? null,
            estatus: ajuste?.estatusInstalacion ?? null,
            estadoAprobada: EstadoFilaSolicitudCarnet.APROBADA,
            estadoPendiente: EstadoFilaSolicitudCarnet.PENDIENTE,
          },
        );
        if (actualizadas.length === 0) {
          throw new ExcepcionNegocio(
            CodigosError.SOLICITUD_ESTADO_INVALIDO,
            'Una de las filas ya fue revisada.',
            409,
          );
        }
      }

      await ejecutar(
        `
        UPDATE ${TABLA_FILA}
        SET estado = @estadoNoAprobada
        WHERE fk_version = @idVersion AND estado = @estadoPendiente
      `,
        {
          idVersion,
          estadoNoAprobada: EstadoFilaSolicitudCarnet.NO_APROBADA,
          estadoPendiente: EstadoFilaSolicitudCarnet.PENDIENTE,
        },
      );

      const versiones = await ejecutar<{ idVersion: number }>(
        `
        UPDATE ${TABLA_VERSION}
        SET estado = @estado,
            usuario_revisor = @usuarioRevisor,
            comentario_revision = @comentario,
            fecha_revision = SYSDATETIME()
        OUTPUT INSERTED.id_version AS idVersion
        WHERE id_version = @idVersion AND estado = @estadoPendiente
      `,
        {
          idVersion,
          estado: estadoFinal,
          usuarioRevisor,
          comentario,
          estadoPendiente: EstadoSolicitudCarnet.PENDIENTE_REVISION,
        },
      );
      if (versiones.length === 0) {
        throw new ExcepcionNegocio(
          CodigosError.SOLICITUD_ESTADO_INVALIDO,
          'La versión ya fue revisada.',
          409,
        );
      }

      await ejecutar(
        `
        UPDATE ${TABLA_SOLICITUD}
        SET estado = @estado,
            fecha_cierre = CASE WHEN @cerrar = 1 THEN SYSDATETIME() ELSE NULL END,
            fecha_limite_aceptacion = CASE WHEN @cerrar = 0 THEN
              DATEADD(day, CASE (DATEDIFF(day, '19000101', SYSDATETIME()) % 7)
                WHEN 0 THEN 3 WHEN 1 THEN 3 WHEN 2 THEN 5 WHEN 3 THEN 5
                WHEN 4 THEN 5 WHEN 5 THEN 4 ELSE 3 END, SYSDATETIME()) ELSE NULL END,
            usuario_cierre = CASE WHEN @cerrar = 1 THEN @usuarioRevisor ELSE NULL END,
            motivo_cierre = CASE WHEN @cerrar = 1 THEN 'REVISION' ELSE NULL END
        WHERE id_solicitud = @idSolicitud
      `,
        {
          idSolicitud,
          usuarioRevisor,
          estado: estadoFinal,
          cerrar:
            estadoFinal === EstadoSolicitudCarnet.APROBADA ||
            estadoFinal === EstadoSolicitudCarnet.RECHAZADA
              ? 1
              : 0,
        },
      );
      await aplicarCambios();
      return estadoFinal;
    });
  }

  async obtenerArchivo(
    idVersion: number,
    tipoArchivo: 'solicitud' | 'vobo',
  ): Promise<ArchivoSolicitudCarnetEntidad | null> {
    const columnaNombre = tipoArchivo === 'solicitud' ? 'archivo_solicitud_nombre' : 'vobo_nombre';
    const columnaTipo = tipoArchivo === 'solicitud' ? 'archivo_solicitud_tipo' : 'vobo_tipo';
    const columnaContenido =
      tipoArchivo === 'solicitud' ? 'archivo_solicitud_contenido' : 'vobo_contenido';
    const filas = await this.sqlServer.ejecutar<FilaSql>(
      `
      SELECT
        s.usuario_solicitante AS usuarioSolicitante,
        v.${columnaNombre} AS nombre,
        v.${columnaTipo} AS tipo,
        v.${columnaContenido} AS contenido
      FROM ${TABLA_VERSION} v
      INNER JOIN ${TABLA_SOLICITUD} s ON s.id_solicitud = v.fk_solicitud
      WHERE v.id_version = @idVersion
    `,
      { idVersion },
    );
    const archivo = filas[0];
    if (!archivo) return null;
    const contenido = this.binario(archivo, 'contenido');
    if (!contenido) return null;
    return {
      usuarioSolicitante: this.texto(archivo, 'usuarioSolicitante') ?? '',
      nombre: this.texto(archivo, 'nombre') ?? '',
      tipo: this.texto(archivo, 'tipo') ?? 'application/octet-stream',
      contenido,
    };
  }

  private async insertarVersion(
    ejecutar: EjecutorSqlServer,
    idSolicitud: number,
    numeroVersion: number,
    comentario: string | null,
    archivos: DatosArchivosSolicitud,
  ): Promise<number> {
    const versiones = await ejecutar<{ idVersion: number }>(
      `
      INSERT INTO ${TABLA_VERSION} (
        fk_solicitud, numero_version, estado, comentario_solicitante,
        archivo_solicitud_nombre, archivo_solicitud_tipo, archivo_solicitud_tamano, archivo_solicitud_contenido,
        vobo_nombre, vobo_tipo, vobo_tamano, vobo_contenido, fecha_creacion
      )
      OUTPUT INSERTED.id_version AS idVersion
      VALUES (
        @idSolicitud, @numeroVersion, @estado, @comentario,
        @archivoSolicitudNombre, @archivoSolicitudTipo, @archivoSolicitudTamano, @archivoSolicitudContenido,
        @voboNombre, @voboTipo, @voboTamano, @voboContenido, SYSDATETIME()
      )
    `,
      {
        idSolicitud,
        numeroVersion,
        estado: EstadoSolicitudCarnet.PENDIENTE_REVISION,
        comentario,
        ...archivos,
      },
    );
    const idVersion = Number(versiones[0]?.['idVersion']);
    if (!Number.isInteger(idVersion)) {
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'No se pudo crear la versión.',
        500,
      );
    }
    return idVersion;
  }

  private async insertarFilas(
    ejecutar: EjecutorSqlServer,
    idVersion: number,
    filas: FilaSolicitudNueva[],
  ): Promise<void> {
    for (const fila of filas) {
      await ejecutar(
        `
        INSERT INTO ${TABLA_FILA} (
          fk_version, numero_fila, id_posicion, id_informe, frecuencia, estatus_instalacion,
          nombre_posicion, nombre_informe, estado
        )
        VALUES (
          @idVersion, @numeroFila, @idPosicion, @idInforme, @frecuencia, @estatusInstalacion,
          @nombrePosicion, @nombreInforme, @estado
        )
      `,
        {
          idVersion,
          numeroFila: fila.numeroFila,
          idPosicion: fila.idPosicion,
          idInforme: fila.idInforme,
          frecuencia: fila.frecuencia,
          estatusInstalacion: fila.estatusInstalacion,
          nombrePosicion: fila.nombrePosicion,
          nombreInforme: fila.nombreInforme,
          estado: EstadoFilaSolicitudCarnet.PENDIENTE,
        },
      );
    }
  }

  private mapearResumen(fila: FilaSql): SolicitudCarnetResumenEntidad {
    return {
      idSolicitud: this.numero(fila, 'idSolicitud'),
      operacion: this.texto(fila, 'operacion') as OperacionCarga,
      usuarioSolicitante: this.texto(fila, 'usuarioSolicitante') ?? '',
      estado: this.texto(fila, 'estado') as EstadoSolicitudCarnet,
      fechaCreacion: this.texto(fila, 'fechaCreacion') ?? '',
      fechaCierre: this.texto(fila, 'fechaCierre'),
      fechaLimiteAceptacion: this.texto(fila, 'fechaLimiteAceptacion'),
      usuarioCierre: this.texto(fila, 'usuarioCierre'),
      motivoCierre: this.texto(fila, 'motivoCierre'),
      totalVersiones: this.numero(fila, 'totalVersiones'),
    };
  }

  private mapearVersion(
    fila: FilaSql,
    filasPorVersion: Map<number, FilaSolicitudCarnetEntidad[]>,
  ): VersionSolicitudCarnetEntidad {
    const idVersion = this.numero(fila, 'idVersion');
    return {
      idVersion,
      numeroVersion: this.numero(fila, 'numeroVersion'),
      estado: this.texto(fila, 'estado') as EstadoSolicitudCarnet,
      comentarioSolicitante: this.texto(fila, 'comentarioSolicitante'),
      comentarioRevision: this.texto(fila, 'comentarioRevision'),
      usuarioRevisor: this.texto(fila, 'usuarioRevisor'),
      fechaCreacion: this.texto(fila, 'fechaCreacion') ?? '',
      fechaRevision: this.texto(fila, 'fechaRevision'),
      archivoSolicitudNombre: this.texto(fila, 'archivoSolicitudNombre') ?? '',
      voboNombre: this.texto(fila, 'voboNombre') ?? '',
      filas: filasPorVersion.get(idVersion) ?? [],
    };
  }

  private mapearFila(fila: FilaSql): FilaSolicitudCarnetEntidad {
    return {
      idFila: this.numero(fila, 'idFila'),
      numeroFila: this.numero(fila, 'numeroFila'),
      idPosicion: this.numero(fila, 'idPosicion'),
      idInforme: this.numero(fila, 'idInforme'),
      frecuencia: this.texto(fila, 'frecuencia'),
      estatusInstalacion: this.texto(fila, 'estatusInstalacion'),
      frecuenciaAprobada: this.texto(fila, 'frecuenciaAprobada'),
      estatusAprobado: this.texto(fila, 'estatusAprobado'),
      nombrePosicion: this.texto(fila, 'nombrePosicion'),
      nombreInforme: this.texto(fila, 'nombreInforme'),
      estado: this.texto(fila, 'estado') as EstadoFilaSolicitudCarnet,
    };
  }

  private numero(fila: FilaSql, columna: string): number {
    return Number(fila[columna] ?? 0);
  }

  private async camposRevisionDisponibles(): Promise<boolean> {
    const filas = await this.sqlServer.ejecutar<{ disponibles: number }>(`
      SELECT CASE WHEN COL_LENGTH('dbo.CI_SOLICITUD_CARNET_FILA', 'estatus_instalacion') IS NOT NULL
        AND COL_LENGTH('dbo.CI_SOLICITUD_CARNET_FILA', 'frecuencia_aprobada') IS NOT NULL
        AND COL_LENGTH('dbo.CI_SOLICITUD_CARNET_FILA', 'estatus_aprobado') IS NOT NULL
        THEN 1 ELSE 0 END AS disponibles`);
    return Number(filas[0]?.disponibles) === 1;
  }

  private async columnasRevision(): Promise<string> {
    return (await this.camposRevisionDisponibles())
      ? 'estatus_instalacion AS estatusInstalacion, frecuencia_aprobada AS frecuenciaAprobada, estatus_aprobado AS estatusAprobado'
      : 'NULL AS estatusInstalacion, NULL AS frecuenciaAprobada, NULL AS estatusAprobado';
  }

  private async asegurarCamposRevision(): Promise<void> {
    if (!(await this.camposRevisionDisponibles()) || !(await this.cierreDisponible())) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'No se puede guardar la solicitud. Contacta al administrador.',
        409,
      );
    }
  }

  async cierreDisponible(): Promise<boolean> {
    const filas = await this.sqlServer.ejecutar<{ disponible: number }>(`SELECT CASE WHEN
      COL_LENGTH('dbo.CI_SOLICITUD_CARNET','fecha_limite_aceptacion') IS NOT NULL AND
      COL_LENGTH('dbo.CI_SOLICITUD_CARNET','usuario_cierre') IS NOT NULL AND
      COL_LENGTH('dbo.CI_SOLICITUD_CARNET','motivo_cierre') IS NOT NULL THEN 1 ELSE 0 END disponible`);
    return Number(filas[0]?.disponible) === 1;
  }

  async aceptarParcial(idSolicitud: number, usuario: string): Promise<void> {
    await this.asegurarCamposRevision();
    const filas = await this.sqlServer.ejecutar(
      `UPDATE ${TABLA_SOLICITUD}
      SET estado=@aprobada, fecha_cierre=SYSDATETIME(), usuario_cierre=@usuario, motivo_cierre='SOLICITANTE'
      OUTPUT INSERTED.id_solicitud
      WHERE id_solicitud=@idSolicitud AND usuario_solicitante=@usuario AND estado=@parcial`,
      {
        idSolicitud,
        usuario,
        aprobada: EstadoSolicitudCarnet.APROBADA,
        parcial: EstadoSolicitudCarnet.APROBADA_PARCIAL,
      },
    );
    if (!filas.length)
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_ESTADO_INVALIDO,
        'La solicitud ya no está pendiente de aceptación.',
        409,
      );
  }

  async cerrarParcialesVencidas(): Promise<void> {
    if (!(await this.cierreDisponible())) return;
    await this.sqlServer.ejecutar(
      `UPDATE ${TABLA_SOLICITUD}
      SET estado=@aprobada, fecha_cierre=SYSDATETIME(), usuario_cierre='SISTEMA', motivo_cierre='SLA'
      WHERE estado=@parcial AND fecha_limite_aceptacion <= SYSDATETIME()`,
      { aprobada: EstadoSolicitudCarnet.APROBADA, parcial: EstadoSolicitudCarnet.APROBADA_PARCIAL },
    );
  }

  private texto(fila: FilaSql, columna: string): string | null {
    const valor = fila[columna];
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto.length > 0 ? texto : null;
  }

  private binario(fila: FilaSql, columna: string): Buffer | null {
    const valor = fila[columna];
    if (Buffer.isBuffer(valor)) return valor;
    if (valor instanceof Uint8Array) return Buffer.from(valor);
    return null;
  }
}
