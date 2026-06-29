import { Injectable } from '@nestjs/common';
import { InformeAsignadoEntidad, InformeEntidad } from './entidades/informe.entidad';
import { InformesRepository } from './informes.repository';

@Injectable()
export class InformesService {
  constructor(private readonly repositorio: InformesRepository) {}

  async buscar(filtro: string): Promise<InformeEntidad[]> {
    return this.repositorio.buscar((filtro ?? '').trim());
  }

  async obtenerListadoPorUsuario(skEmpleado: number): Promise<InformeAsignadoEntidad[]> {
    return this.repositorio.obtenerListadoPorUsuario(skEmpleado);
  }

  async obtenerFrecuenciasDisponibles(): Promise<string[]> {
    return this.repositorio.obtenerFrecuenciasDisponibles();
  }
}
