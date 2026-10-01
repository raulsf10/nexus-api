import { Injectable } from '@nestjs/common';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { InformesRepository } from '../informes/informes.repository';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { ExcepcionesCarnetEsquemaService } from '../excepciones-carnet/excepciones-carnet-esquema.service';
import {
  ConsultarRelacionesJtracDto,
  ConsultarReporteJtracDto,
  GuardarRelacionJtracDto,
} from './dto/jtrac-pdi.dto';
import { MODULO_GESTION_JTRAC_PDI, MODULO_REPORTE_JTRAC_PDI } from './jtrac-pdi.constantes';
import { JtracPdiRepository } from './jtrac-pdi.repository';

@Injectable()
export class JtracPdiService {
  constructor(
    private readonly repositorio: JtracPdiRepository,
    private readonly informes: InformesRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly excepciones: ExcepcionesCarnetEsquemaService,
  ) {}

  validarConsulta(usuario: UsuarioJwtInterface): void {
    if (
      ![MODULO_GESTION_JTRAC_PDI, MODULO_REPORTE_JTRAC_PDI].some((modulo) =>
        usuario.modulos.includes(modulo),
      )
    ) {
      throw new ExcepcionNegocio(
        CodigosError.NO_AUTORIZADO,
        'No tienes acceso al módulo JTRAC–PDI.',
        403,
      );
    }
  }

  async estado(usuario: UsuarioJwtInterface) {
    this.validarConsulta(usuario);
    const esquema = await this.repositorio.estadoEsquema();
    return {
      ...esquema,
      puedeAdministrar: usuario.modulos.includes(MODULO_GESTION_JTRAC_PDI),
      excepcionesDisponibles: await this.excepciones.estaDisponible(),
    };
  }

  async consultar(dto: ConsultarRelacionesJtracDto) {
    await this.exigirTabla();
    return this.repositorio.consultar(dto);
  }

  buscarFolios(busqueda: string) {
    return this.repositorio.buscarFolios(busqueda);
  }

  async indicadores(folioJtrac: string) {
    this.validarLongitudFolio(folioJtrac);
    return { folioJtrac, ...(await this.repositorio.indicadores(folioJtrac)) };
  }

  async crear(dto: GuardarRelacionJtracDto, usuario: UsuarioJwtInterface) {
    const esquema = await this.exigirTabla();
    if (!esquema.secuenciaDisponible)
      throw new ExcepcionNegocio(
        CodigosError.JTRAC_NO_DISPONIBLE,
        'Falta crear SEQ_CI_JTRAC_PDI o conceder SELECT sobre la secuencia a CI_PANEL.',
        503,
      );
    await this.validarRelacion(dto);
    return { idRelacion: await this.repositorio.crear(dto, usuario.usuario) };
  }

  async actualizar(idRelacion: number, dto: GuardarRelacionJtracDto, usuario: UsuarioJwtInterface) {
    await this.exigirTabla();
    await this.validarRelacion(dto);
    await this.repositorio.actualizar(idRelacion, dto, usuario.usuario);
    return { exitoso: true };
  }

  async eliminar(idRelacion: number, usuario: UsuarioJwtInterface) {
    await this.exigirTabla();
    await this.repositorio.eliminar(idRelacion, usuario.usuario);
  }

  async reporte(dto: ConsultarReporteJtracDto, usuario: UsuarioJwtInterface) {
    this.validarConsulta(usuario);
    await this.exigirTabla();
    if (!(await this.excepciones.estaDisponible()))
      throw new ExcepcionNegocio(
        CodigosError.JTRAC_NO_DISPONIBLE,
        'No se puede generar el reporte sin consultar las excepciones de CARNET. Revisa su tabla y los permisos.',
        503,
      );
    const [resultado, posicion] = await Promise.all([
      this.repositorio.reporte(dto),
      dto.idPosicion === undefined ? null : this.usuarios.obtenerPorSkEmpleado(dto.idPosicion),
    ]);
    return { ...resultado, idPosicion: dto.idPosicion ?? null, posicion, respetaExcepciones: true };
  }

  private async exigirTabla() {
    const esquema = await this.repositorio.estadoEsquema();
    if (!esquema.tablaDisponible)
      throw new ExcepcionNegocio(
        CodigosError.JTRAC_NO_DISPONIBLE,
        'La tabla DIM_CI_JTRAC_PDI aún no está disponible con la estructura requerida. Está pendiente el ticket de creación y permisos.',
        503,
      );
    return esquema;
  }

  private async validarRelacion(dto: GuardarRelacionJtracDto): Promise<void> {
    this.validarLongitudFolio(dto.folioJtrac);
    const [informe, folio] = await Promise.all([
      this.informes.obtenerPorSkVeo(dto.idInforme),
      this.repositorio.indicadores(dto.folioJtrac),
    ]);
    if (!informe)
      throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El PDI no existe en DIM_VEO.', 400);
    if (!folio.existe)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'El folio JTRAC no existe en VW_BASE_FABRICA_V2.',
        400,
      );
  }

  private validarLongitudFolio(folio: string) {
    if (Buffer.byteLength(folio, 'utf8') > 256)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'El folio supera el tamaño permitido de 256 bytes.',
        400,
      );
  }
}
