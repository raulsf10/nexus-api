import { Injectable } from '@nestjs/common';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { ConsultarExcepcionesCarnetDto } from './dto/consultar-excepciones-carnet.dto';
import { GuardarExcepcionCarnetDto } from './dto/guardar-excepcion-carnet.dto';
import { ResultadoExcepcionesCarnet } from './entidades/excepcion-carnet.entidad';
import { ExcepcionesCarnetEsquemaService } from './excepciones-carnet-esquema.service';
import { ExcepcionesCarnetRepository } from './excepciones-carnet.repository';

const TAMANIO_PAGINA_POR_DEFECTO = 25;

@Injectable()
export class ExcepcionesCarnetService {
  constructor(
    private readonly repositorio: ExcepcionesCarnetRepository,
    private readonly esquema: ExcepcionesCarnetEsquemaService,
  ) {}

  async consultar(dto: ConsultarExcepcionesCarnetDto): Promise<ResultadoExcepcionesCarnet> {
    await this.asegurarDisponible();
    const pagina = dto.pagina ?? 1;
    const tamanioPagina = dto.tamanioPagina ?? TAMANIO_PAGINA_POR_DEFECTO;
    const busqueda = dto.busqueda?.trim() || undefined;
    const total = await this.repositorio.contar(busqueda);
    const registros =
      total === 0 ? [] : await this.repositorio.consultar(pagina, tamanioPagina, busqueda);
    return { total, pagina, tamanioPagina, registros };
  }

  async crear(
    dto: GuardarExcepcionCarnetDto,
    usuario: UsuarioJwtInterface,
  ): Promise<{ idExcepcion: number }> {
    await this.asegurarDisponible();
    const idPosicion = dto.idPosicion ?? null;
    await this.asegurarReglaNoDuplicada(idPosicion, dto.idInforme);
    const idExcepcion = await this.repositorio.crear(
      idPosicion,
      dto.idInforme,
      dto.comentario?.trim() || null,
      usuario.usuario,
    );
    return { idExcepcion };
  }

  async actualizar(
    idExcepcion: number,
    dto: GuardarExcepcionCarnetDto,
    usuario: UsuarioJwtInterface,
  ): Promise<void> {
    await this.asegurarDisponible();
    const idPosicion = dto.idPosicion ?? null;
    await this.asegurarReglaNoDuplicada(idPosicion, dto.idInforme, idExcepcion);
    if (!(await this.repositorio.existe(idExcepcion))) {
      throw this.excepcionNoEncontrada();
    }
    await this.repositorio.actualizar(
      idExcepcion,
      idPosicion,
      dto.idInforme,
      dto.comentario?.trim() || null,
      usuario.usuario,
    );
  }

  async eliminar(idExcepcion: number): Promise<void> {
    await this.asegurarDisponible();
    if (!(await this.repositorio.existe(idExcepcion))) {
      throw this.excepcionNoEncontrada();
    }
    await this.repositorio.eliminar(idExcepcion);
  }

  private async asegurarDisponible(): Promise<void> {
    if (!(await this.esquema.estaDisponible())) {
      throw new ExcepcionNegocio(
        CodigosError.EXCEPCIONES_NO_DISPONIBLES,
        'La tabla de excepciones aún no existe. Ejecute el script Oracle del módulo.',
        503,
      );
    }
  }

  private async asegurarReglaNoDuplicada(
    idPosicion: number | null,
    idInforme: number,
    idExcepcionExcluir?: number,
  ): Promise<void> {
    if (await this.repositorio.existeRegla(idPosicion, idInforme, idExcepcionExcluir)) {
      const alcance =
        idPosicion === null ? 'para todas las posiciones' : `para la posición ${idPosicion}`;
      throw new ExcepcionNegocio(
        CodigosError.EXCEPCION_DUPLICADA,
        `El informe ${idInforme} ya tiene una excepción ${alcance}.`,
        409,
      );
    }
  }

  private excepcionNoEncontrada(): ExcepcionNegocio {
    return new ExcepcionNegocio(
      CodigosError.EXCEPCION_NO_ENCONTRADA,
      'La excepción indicada no existe o ya fue eliminada.',
      404,
    );
  }
}
