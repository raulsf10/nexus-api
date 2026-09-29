import { Injectable } from '@nestjs/common';
import { ConsultarCarnetDto } from './dto/consultar-carnet.dto';
import { ResultadoConsultaCarnet } from './entidades/registro-carnet.entidad';
import { CarnetConsultaRepositoryOracle } from './carnet-consulta.repository.oracle';

const TAMANIO_PAGINA_POR_DEFECTO = 25;

@Injectable()
export class CarnetConsultaService {
  constructor(private readonly repositorio: CarnetConsultaRepositoryOracle) {}

  async consultar(filtros: ConsultarCarnetDto): Promise<ResultadoConsultaCarnet> {
    const pagina = filtros.pagina ?? 1;
    const tamanioPagina = filtros.tamanioPagina ?? TAMANIO_PAGINA_POR_DEFECTO;
    const busqueda = filtros.busqueda?.trim() || undefined;
    const total = await this.repositorio.contar(busqueda);
    const registros =
      total === 0 ? [] : await this.repositorio.consultar(pagina, tamanioPagina, busqueda);

    return { total, pagina, tamanioPagina, registros };
  }
}
