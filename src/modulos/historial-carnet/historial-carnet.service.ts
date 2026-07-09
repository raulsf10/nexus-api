import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../comun/logger/logger.service';
import { InformesRepository } from '../informes/informes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { ConsultarHistorialDto } from './dto/consultar-historial.dto';
import { ResultadoHistorial } from './entidades/historial-carnet.entidad';
import { AccionHistorial } from './enums/accion-historial.enum';
import { OrigenHistorial } from './enums/origen-historial.enum';
import { HistorialCarnetRepository } from './historial-carnet.repository';

const TAMANIO_PAGINA_POR_DEFECTO = 50;

interface CambioHistorial {
  usuario: string;
  accion: AccionHistorial;
  fkPosicion: number;
  fkVeo: number;
  frecuencia?: string | null;
  origen: OrigenHistorial;
}

@Injectable()
export class HistorialCarnetService {
  constructor(
    private readonly repositorio: HistorialCarnetRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly informes: InformesRepository,
    private readonly logger: LoggerService,
  ) {}

  async consultar(filtros: ConsultarHistorialDto): Promise<ResultadoHistorial> {
    const pagina = filtros.pagina ?? 1;
    const tamanioPagina = filtros.tamanioPagina ?? TAMANIO_PAGINA_POR_DEFECTO;

    const criterios = {
      usuario: filtros.usuario,
      accion: filtros.accion,
      origen: filtros.origen,
      informe: filtros.informe,
      posicion: filtros.posicion,
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
    };

    const total = await this.repositorio.contar(criterios);
    const registros =
      total === 0 ? [] : await this.repositorio.consultar(criterios, pagina, tamanioPagina);

    return { total, pagina, tamanioPagina, registros };
  }

  // Best-effort: NUNCA lanza. Si el SQL Server de historial falla, solo registra
  // una advertencia (el cambio de carnet ya se aplicó y no debe revertirse).
  // Los nombres se resuelven aquí si el llamador no los provee ya (snapshot).
  async registrarCambio(
    cambio: CambioHistorial,
    nombres?: { posicion: string | null; informe: string | null },
  ): Promise<void> {
    try {
      const nombrePosicion = nombres
        ? nombres.posicion
        : await this.resolverNombrePosicion(cambio.fkPosicion);
      const nombreInforme = nombres
        ? nombres.informe
        : await this.resolverNombreInforme(cambio.fkVeo);

      await this.repositorio.registrar({
        usuario: cambio.usuario,
        accion: cambio.accion,
        fkPosicion: cambio.fkPosicion,
        fkVeo: cambio.fkVeo,
        nombrePosicion,
        nombreInforme,
        frecuencia: cambio.frecuencia ?? null,
        origen: cambio.origen,
      });
    } catch (error) {
      this.logger.advertencia('No se pudo registrar el historial de carnet', {
        accion: cambio.accion,
        fkPosicion: cambio.fkPosicion,
        fkVeo: cambio.fkVeo,
        origen: cambio.origen,
        error: (error as Error).message,
      });
    }
  }

  async resolverNombrePosicion(idPosicion: number): Promise<string | null> {
    const posicion = await this.usuarios.obtenerPorSkEmpleado(idPosicion);
    return posicion ? posicion.descripcion : null;
  }

  async resolverNombreInforme(idInforme: number): Promise<string | null> {
    const informe = await this.informes.obtenerPorSkVeo(idInforme);
    return informe ? informe.nombre : null;
  }
}
