import { Injectable } from '@nestjs/common';
import { extname } from 'path';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { CargaMasivaService } from '../carga-masiva/carga-masiva.service';
import { OperacionCarga } from '../carga-masiva/enums/operacion-carga.enum';
import { FilaValidada } from '../carga-masiva/interfaces/resultado-validacion.interface';
import { CrearSolicitudCarnetDto } from './dto/crear-solicitud-carnet.dto';
import {
  ConsultarSolicitudesCarnetDto,
  VistaSolicitudesCarnet,
} from './dto/consultar-solicitudes-carnet.dto';
import { RevisarSolicitudCarnetDto } from './dto/revisar-solicitud-carnet.dto';
import {
  EXTENSION_ARCHIVO_SOLICITUD,
  EXTENSIONES_VOBO_VALIDAS,
  MODULO_SEGUIMIENTO_SOLICITUDES_CARNET,
  MODULO_SOLICITUDES_CARNET,
} from './solicitudes-carnet.constantes';
import { EstadoSolicitudCarnet } from './enums/estado-solicitud-carnet.enum';
import {
  ArchivoSolicitudCarnetEntidad,
  DatosArchivosSolicitud,
  FilaSolicitudNueva,
  PaginaSolicitudesCarnetEntidad,
  SolicitudCarnetDetalleEntidad,
} from './entidades/solicitud-carnet.entidad';
import { SolicitudesCarnetRepository } from './solicitudes-carnet.repository';

export interface ArchivoSubidoSolicitud {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class SolicitudesCarnetService {
  constructor(
    private readonly repositorio: SolicitudesCarnetRepository,
    private readonly cargaMasiva: CargaMasivaService,
  ) {}

  async consultar(
    dto: ConsultarSolicitudesCarnetDto,
    usuario: UsuarioJwtInterface,
  ): Promise<PaginaSolicitudesCarnetEntidad> {
    const vista = dto.vista ?? VistaSolicitudesCarnet.MIS_SOLICITUDES;
    const pagina = dto.pagina ?? 1;
    const tamanioPagina = dto.tamanioPagina ?? 25;
    const esSeguimiento = vista === VistaSolicitudesCarnet.SEGUIMIENTO;
    if (esSeguimiento) {
      this.verificarModulo(usuario, MODULO_SEGUIMIENTO_SOLICITUDES_CARNET);
    } else {
      this.verificarModulo(usuario, MODULO_SOLICITUDES_CARNET);
    }

    const usuarioSolicitante = esSeguimiento ? undefined : usuario.usuario;
    const [total, registros] = await Promise.all([
      this.repositorio.contar(usuarioSolicitante),
      this.repositorio.consultar(pagina, tamanioPagina, usuarioSolicitante),
    ]);
    return { registros, total, pagina, tamanioPagina };
  }

  async obtenerDetalle(
    idSolicitud: number,
    usuario: UsuarioJwtInterface,
  ): Promise<SolicitudCarnetDetalleEntidad> {
    const solicitud = await this.repositorio.obtenerDetalle(idSolicitud);
    if (!solicitud) {
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_NO_ENCONTRADA,
        'La solicitud no existe.',
        404,
      );
    }
    this.verificarAcceso(solicitud.usuarioSolicitante, usuario);
    return solicitud;
  }

  async crear(
    dto: CrearSolicitudCarnetDto,
    archivoSolicitud: ArchivoSubidoSolicitud,
    vobo: ArchivoSubidoSolicitud,
    usuario: UsuarioJwtInterface,
  ): Promise<{ idSolicitud: number; idVersion: number }> {
    this.verificarModulo(usuario, MODULO_SOLICITUDES_CARNET);
    const operacion = dto.operacion ?? OperacionCarga.ASIGNACION;
    const filas = await this.validarArchivoSolicitud(archivoSolicitud, operacion);
    return this.repositorio.crearSolicitud(
      usuario.usuario,
      operacion,
      dto.comentario?.trim() || null,
      this.prepararDatosArchivos(archivoSolicitud, vobo),
      filas,
    );
  }

  async crearNuevaVersion(
    idSolicitud: number,
    dto: CrearSolicitudCarnetDto,
    archivoSolicitud: ArchivoSubidoSolicitud,
    vobo: ArchivoSubidoSolicitud,
    usuario: UsuarioJwtInterface,
  ): Promise<{ idSolicitud: number; idVersion: number }> {
    this.verificarModulo(usuario, MODULO_SOLICITUDES_CARNET);
    const solicitud = await this.obtenerDetalle(idSolicitud, usuario);
    if (solicitud.usuarioSolicitante !== usuario.usuario || solicitud.estado !== EstadoSolicitudCarnet.APROBADA_PARCIAL) {
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_ESTADO_INVALIDO,
        'Solo se puede cargar una nueva versión para una solicitud parcialmente aprobada propia.',
        409,
      );
    }
    if (dto.operacion !== undefined && dto.operacion !== solicitud.operacion) {
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'La nueva versión debe conservar el tipo de operación de la solicitud.', 400);
    }
    const filas = await this.validarArchivoSolicitud(archivoSolicitud, solicitud.operacion);
    return this.repositorio.crearNuevaVersion(
      idSolicitud,
      usuario.usuario,
      dto.comentario?.trim() || null,
      this.prepararDatosArchivos(archivoSolicitud, vobo),
      filas,
    );
  }

  async revisar(
    idVersion: number,
    dto: RevisarSolicitudCarnetDto,
    usuario: UsuarioJwtInterface,
  ): Promise<{ estado: EstadoSolicitudCarnet }> {
    this.verificarModulo(usuario, MODULO_SEGUIMIENTO_SOLICITUDES_CARNET);
    const version = await this.repositorio.obtenerVersionPendiente(idVersion);
    if (!version) {
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_NO_ENCONTRADA,
        'La versión de la solicitud no existe.',
        404,
      );
    }
    if (version.estado !== EstadoSolicitudCarnet.PENDIENTE_REVISION || version.filas.length === 0) {
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_ESTADO_INVALIDO,
        'La versión ya fue revisada o no tiene filas pendientes.',
        409,
      );
    }

    const idsPendientes = new Set(version.filas.map((fila) => fila.idFila));
    if (dto.filasAprobadas.some((idFila) => !idsPendientes.has(idFila))) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Solo se pueden aprobar filas pendientes de esta versión.',
        400,
      );
    }
    const comentario = dto.comentario?.trim() || null;
    if (dto.filasAprobadas.length === 0 && comentario === null) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Debe indicar el motivo del rechazo.',
        400,
      );
    }

    const aplicarCambios = async (): Promise<void> => {
      if (dto.filasAprobadas.length === 0) return;
      const filasAprobadas = version.filas.filter((fila) =>
        dto.filasAprobadas.includes(fila.idFila),
      );
      const resultado = await this.cargaMasiva.procesar(
        version.operacion,
        filasAprobadas.map((fila) => ({
          fila: fila.numeroFila,
          idPosicion: fila.idPosicion,
          idInforme: fila.idInforme,
          frecuencia: fila.frecuencia,
        })),
        usuario.usuario,
      );
      if (resultado.fallidas > 0) {
        const motivo =
          resultado.resultados.find((fila) => !fila.exitoso)?.mensaje ??
          'No se aplicaron los cambios solicitados.';
        throw new ExcepcionNegocio(CodigosError.VALIDACION, motivo, 409);
      }
    };

    const estado = await this.repositorio.registrarRevision(
      version.idSolicitud,
      idVersion,
      usuario.usuario,
      dto.filasAprobadas,
      comentario,
      aplicarCambios,
    );
    return { estado };
  }

  async obtenerArchivo(
    idVersion: number,
    tipoArchivo: 'solicitud' | 'vobo',
    usuario: UsuarioJwtInterface,
  ): Promise<ArchivoSolicitudCarnetEntidad> {
    const archivo = await this.repositorio.obtenerArchivo(idVersion, tipoArchivo);
    if (!archivo) {
      throw new ExcepcionNegocio(
        CodigosError.SOLICITUD_NO_ENCONTRADA,
        'El archivo no existe.',
        404,
      );
    }
    this.verificarAcceso(archivo.usuarioSolicitante, usuario);
    return archivo;
  }

  private async validarArchivoSolicitud(
    archivo: ArchivoSubidoSolicitud,
    operacion: OperacionCarga,
  ): Promise<FilaSolicitudNueva[]> {
    if (extname(archivo.originalname).toLowerCase() !== EXTENSION_ARCHIVO_SOLICITUD) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'La solicitud debe cargarse en formato .xlsx.',
        400,
      );
    }
    const resultado = await this.cargaMasiva.validarArchivo(
      operacion,
      archivo.buffer,
    );
    if (resultado.filasConError > 0) {
      const primerError = resultado.filas.find((fila) => fila.estado === 'error');
      const mensaje = primerError?.errores[0]?.mensaje ?? 'La plantilla contiene filas inválidas.';
      throw new ExcepcionNegocio(CodigosError.ARCHIVO_INVALIDO, mensaje, 400);
    }
    if (resultado.filas.length === 0) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'La plantilla no contiene registros para solicitar.',
        400,
      );
    }
    return resultado.filas.map((fila) => this.aFilaNueva(fila));
  }

  private aFilaNueva(fila: FilaValidada): FilaSolicitudNueva {
    if (fila.idPosicion === null || fila.idInforme === null) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'La plantilla contiene identificadores inválidos.',
        400,
      );
    }
    return {
      numeroFila: fila.fila,
      idPosicion: fila.idPosicion,
      idInforme: fila.idInforme,
      frecuencia: fila.frecuencia,
      nombrePosicion: fila.nombrePosicion,
      nombreInforme: fila.nombreInforme,
    };
  }

  private prepararDatosArchivos(
    archivoSolicitud: ArchivoSubidoSolicitud,
    vobo: ArchivoSubidoSolicitud,
  ): DatosArchivosSolicitud {
    const extensionVobo = extname(vobo.originalname).toLowerCase();
    if (!EXTENSIONES_VOBO_VALIDAS.has(extensionVobo)) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El VoBo debe ser un PDF, PNG o JPG.',
        400,
      );
    }

    return {
      archivoSolicitudNombre: archivoSolicitud.originalname,
      archivoSolicitudTipo:
        archivoSolicitud.mimetype ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      archivoSolicitudTamano: archivoSolicitud.size,
      archivoSolicitudContenido: archivoSolicitud.buffer,
      voboNombre: vobo.originalname,
      voboTipo: this.tipoVobo(extensionVobo, vobo.mimetype),
      voboTamano: vobo.size,
      voboContenido: vobo.buffer,
    };
  }

  private tipoVobo(extension: string, tipoRecibido: string): string {
    const tiposPorExtension: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    return (tiposPorExtension[extension] ?? tipoRecibido) || 'application/octet-stream';
  }

  private verificarAcceso(usuarioSolicitante: string, usuario: UsuarioJwtInterface): void {
    if (
      usuario.usuario === usuarioSolicitante &&
      usuario.modulos.includes(MODULO_SOLICITUDES_CARNET)
    ) {
      return;
    }
    this.verificarModulo(usuario, MODULO_SEGUIMIENTO_SOLICITUDES_CARNET);
  }

  private verificarModulo(usuario: UsuarioJwtInterface, modulo: string): void {
    if (!usuario.modulos.includes(modulo)) {
      throw new ExcepcionNegocio(
        CodigosError.NO_AUTORIZADO,
        `No tiene acceso al módulo: ${modulo}`,
        403,
      );
    }
  }
}
