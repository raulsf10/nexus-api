import { AccionHistorial } from '../enums/accion-historial.enum';
import { OrigenHistorial } from '../enums/origen-historial.enum';

export interface HistorialCarnetEntidad {
  idSolicitud: number | null;
  fechaSolicitud: string | null;
  fechaAtencion: string | null;
  slaMinutosHabiles: number | null;
  idHistorial: number;
  usuario: string;
  accion: AccionHistorial;
  fkPosicion: number;
  fkVeo: number;
  nombrePosicion: string | null;
  nombreInforme: string | null;
  frecuencia: string | null;
  origen: OrigenHistorial;
  fecha: string;
}

export interface ResultadoHistorial {
  total: number;
  pagina: number;
  tamanioPagina: number;
  registros: HistorialCarnetEntidad[];
}

// Datos que registra una operación de escritura del carnet. Los nombres van
// resueltos por la app (snapshot), porque el SQL Server de historial no ve los
// catálogos Oracle.
export interface RegistroHistorial {
  idVersionSolicitud?: number;
  usuario: string;
  accion: AccionHistorial;
  fkPosicion: number;
  fkVeo: number;
  nombrePosicion: string | null;
  nombreInforme: string | null;
  frecuencia?: string | null;
  origen: OrigenHistorial;
}
