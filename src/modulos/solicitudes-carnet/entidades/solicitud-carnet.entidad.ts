import { OperacionCarga } from '../../carga-masiva/enums/operacion-carga.enum';
import {
  EstadoFilaSolicitudCarnet,
  EstadoSolicitudCarnet,
} from '../enums/estado-solicitud-carnet.enum';

export interface FilaSolicitudCarnetEntidad {
  idFila: number;
  numeroFila: number;
  idPosicion: number;
  idInforme: number;
  frecuencia: string | null;
  nombrePosicion: string | null;
  nombreInforme: string | null;
  estado: EstadoFilaSolicitudCarnet;
}

export interface VersionSolicitudCarnetEntidad {
  idVersion: number;
  numeroVersion: number;
  estado: EstadoSolicitudCarnet;
  comentarioSolicitante: string | null;
  comentarioRevision: string | null;
  usuarioRevisor: string | null;
  fechaCreacion: string;
  fechaRevision: string | null;
  archivoSolicitudNombre: string;
  voboNombre: string;
  filas: FilaSolicitudCarnetEntidad[];
}

export interface SolicitudCarnetResumenEntidad {
  idSolicitud: number;
  operacion: OperacionCarga;
  usuarioSolicitante: string;
  estado: EstadoSolicitudCarnet;
  fechaCreacion: string;
  fechaCierre: string | null;
  totalVersiones: number;
}

export interface SolicitudCarnetDetalleEntidad extends SolicitudCarnetResumenEntidad {
  versiones: VersionSolicitudCarnetEntidad[];
}

export interface PaginaSolicitudesCarnetEntidad {
  registros: SolicitudCarnetResumenEntidad[];
  total: number;
  pagina: number;
  tamanioPagina: number;
}

export interface ArchivoSolicitudCarnetEntidad {
  usuarioSolicitante: string;
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

export interface FilaSolicitudNueva {
  numeroFila: number;
  idPosicion: number;
  idInforme: number;
  frecuencia: string | null;
  nombrePosicion: string | null;
  nombreInforme: string | null;
}

export interface DatosArchivosSolicitud {
  archivoSolicitudNombre: string;
  archivoSolicitudTipo: string;
  archivoSolicitudTamano: number;
  archivoSolicitudContenido: Buffer;
  voboNombre: string;
  voboTipo: string;
  voboTamano: number;
  voboContenido: Buffer;
}

export interface VersionPendienteRevision {
  idSolicitud: number;
  operacion: OperacionCarga;
  idVersion: number;
  usuarioSolicitante: string;
  estado: EstadoSolicitudCarnet;
  filas: FilaSolicitudCarnetEntidad[];
}
