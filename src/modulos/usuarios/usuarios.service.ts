import { Injectable } from '@nestjs/common';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioListadoEntidad } from './entidades/usuario-listado.entidad';
import { UsuariosRepository } from './usuarios.repository';

const LONGITUD_MINIMA_BUSQUEDA = 2;

@Injectable()
export class UsuariosService {
  constructor(private readonly repositorio: UsuariosRepository) {}

  async buscar(texto: string): Promise<UsuarioListadoEntidad[]> {
    const limpio = (texto ?? '').trim();
    if (limpio.length < LONGITUD_MINIMA_BUSQUEDA) {
      return [];
    }
    return this.repositorio.buscarPorTexto(limpio);
  }

  async obtenerPorSkEmpleado(skEmpleado: number): Promise<UsuarioListadoEntidad> {
    const usuario = await this.repositorio.obtenerPorSkEmpleado(skEmpleado);
    if (!usuario) {
      throw new ExcepcionNegocio(
        CodigosError.USUARIO_NO_ENCONTRADO,
        `No se encontró un usuario con sk_empleado ${skEmpleado}.`,
        404,
      );
    }
    return usuario;
  }
}
