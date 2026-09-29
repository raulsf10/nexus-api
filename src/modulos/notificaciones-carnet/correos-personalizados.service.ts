import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { isEmail } from 'class-validator';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { InformesRepository } from '../informes/informes.repository';
import { NotificacionesCarnetRepositoryOracle } from './notificaciones-carnet.repository.oracle';
import { NotificacionesCarnetService } from './notificaciones-carnet.service';
import {
  DestinatariosPersonalizadosDto,
  EnviarCorreoPersonalizadoDto,
  FiltroDestinatarios,
} from './dto/correo-personalizado.dto';

interface PosicionDestinataria {
  idPosicion: number;
  nombre: string | null;
  correos: string[];
  excluida: boolean;
}

@Injectable()
export class CorreosPersonalizadosService {
  private readonly enviando = new Set<string>();

  constructor(
    private readonly repositorio: NotificacionesCarnetRepositoryOracle,
    private readonly correos: NotificacionesCarnetService,
    private readonly configuracion: ConfiguracionService,
    private readonly informes: InformesRepository,
  ) {}

  async consultar(dto: DestinatariosPersonalizadosDto) {
    const audiencia = await this.audiencia(dto.idInforme);
    const inicio = (dto.pagina - 1) * dto.tamanioPagina;
    const filtro = dto.filtro ?? FiltroDestinatarios.INCLUIDAS;
    let posiciones = audiencia.posiciones;
    if (filtro === FiltroDestinatarios.ASIGNADAS) posiciones = audiencia.asignadas;
    if (filtro === FiltroDestinatarios.EXCLUIDAS)
      posiciones = audiencia.asignadas.filter((posicion) => posicion.excluida);
    if (filtro === FiltroDestinatarios.SIN_CORREO)
      posiciones = audiencia.posiciones.filter((posicion) => !posicion.correos.length);
    const porCorreo = new Map<string, number[]>();
    if (filtro === FiltroDestinatarios.CORREOS_UNICOS) {
      for (const posicion of audiencia.posiciones) {
        for (const correo of posicion.correos) {
          const ids = porCorreo.get(correo) ?? [];
          ids.push(posicion.idPosicion);
          porCorreo.set(correo, ids);
        }
      }
    }
    const correos = [...porCorreo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([correo, posiciones]) => ({ correo, posiciones }));
    const mostrarCorreos = filtro === FiltroDestinatarios.CORREOS_UNICOS;
    return {
      ...this.resumen(audiencia),
      filtro,
      totalFiltrado: mostrarCorreos ? correos.length : posiciones.length,
      registros: mostrarCorreos ? [] : posiciones.slice(inicio, inicio + dto.tamanioPagina),
      registrosCorreos: correos.slice(inicio, inicio + dto.tamanioPagina),
      pagina: dto.pagina,
      tamanioPagina: dto.tamanioPagina,
    };
  }

  async enviar(dto: EnviarCorreoPersonalizadoDto, usuario: string) {
    if (this.enviando.has(usuario)) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Ya tienes un envío en curso. Espera su resultado.',
        409,
      );
    }
    this.enviando.add(usuario);
    try {
      const audiencia = await this.audiencia(dto.idInforme);
      if (audiencia.huellaDestinatarios !== dto.huellaDestinatarios) {
        throw new ExcepcionNegocio(
          CodigosError.VALIDACION,
          'Cambiaron las asignaciones, excepciones o destinatarios. Actualiza la vista previa antes de enviar.',
          409,
        );
      }
      if (!audiencia.destinatarios.length) {
        throw new ExcepcionNegocio(
          CodigosError.VALIDACION,
          'No hay destinatarios válidos para enviar.',
          400,
        );
      }
      this.correos.exigirSmtpPersonalizado();
      const resultados: Array<{ correo: string; enviado: boolean }> = [];
      // CCO en grupos de 50: no se exponen direcciones ni se reintentan envíos ambiguos.
      for (let inicio = 0; inicio < audiencia.destinatarios.length; inicio += 50) {
        const grupo = audiencia.destinatarios.slice(inicio, inicio + 50);
        let aceptados: string[] = [];
        try {
          aceptados = await this.correos.enviarPersonalizado(
            grupo,
            dto.asunto,
            dto.contenido,
            audiencia.nombreInforme,
          );
        } catch {
          /* Un corte SMTP puede ocurrir después de aceptar parte del mensaje. */
        }
        resultados.push(
          ...grupo.map((correo) => ({ correo, enviado: aceptados.includes(correo) })),
        );
      }
      return {
        enviados: resultados.filter((resultado) => resultado.enviado).length,
        noConfirmados: resultados
          .filter((resultado) => !resultado.enviado)
          .map((resultado) => resultado.correo),
        destinatarioForzado: audiencia.destinatarioForzado,
      };
    } finally {
      this.enviando.delete(usuario);
    }
  }

  private async audiencia(idInforme: number) {
    const informe = await this.informes.obtenerPorSkVeo(idInforme);
    if (!informe) throw new ExcepcionNegocio(CodigosError.VALIDACION, 'El informe no existe.', 400);
    // Consultar directamente las excepciones: si faltan permisos, no se permite enviar.
    const filas = await this.repositorio.destinatariosInforme(idInforme);
    const porPosicion = new Map<number, PosicionDestinataria>();
    for (const fila of filas) {
      const idPosicion = Number(fila.ID_POSICION);
      const posicion = porPosicion.get(idPosicion) ?? {
        idPosicion,
        nombre: fila.NOMBRE,
        correos: [],
        excluida: Number(fila.EXCLUIDA) === 1,
      };
      for (const correo of (fila.CORREO ?? '')
        .split(/[,;]/)
        .map((valor) => valor.trim().toLowerCase())) {
        if (isEmail(correo) && !posicion.correos.includes(correo)) posicion.correos.push(correo);
      }
      porPosicion.set(idPosicion, posicion);
    }
    const todas = [...porPosicion.values()].sort((a, b) => a.idPosicion - b.idPosicion);
    const posiciones = todas.filter((posicion) => !posicion.excluida);
    posiciones.forEach((posicion) => posicion.correos.sort());
    const reales = [...new Set(posiciones.flatMap((posicion) => posicion.correos))].sort();
    const destinatarioForzado =
      this.configuracion.obtenerCorreoNotificaciones().destinatarioForzado;
    const destinatarios = posiciones.length && destinatarioForzado ? [destinatarioForzado] : reales;
    const huellaDestinatarios = createHash('sha256')
      .update(JSON.stringify({ idInforme, posiciones, destinatarios }))
      .digest('hex');
    return {
      idInforme,
      nombreInforme: informe.nombre,
      posiciones,
      asignadas: todas,
      destinatarios,
      destinatarioForzado,
      huellaDestinatarios,
      totalPosiciones: todas.length,
      excluidas: todas.length - posiciones.length,
      sinCorreo: posiciones.filter((posicion) => !posicion.correos.length).length,
      correosUnicos: reales.length,
    };
  }

  private resumen(audiencia: Awaited<ReturnType<CorreosPersonalizadosService['audiencia']>>) {
    return {
      idInforme: audiencia.idInforme,
      nombreInforme: audiencia.nombreInforme,
      totalPosiciones: audiencia.totalPosiciones,
      total: audiencia.posiciones.length,
      excluidas: audiencia.excluidas,
      sinCorreo: audiencia.sinCorreo,
      correosUnicos: audiencia.correosUnicos,
      enviosPrevistos: audiencia.destinatarios.length,
      destinatarioForzado: audiencia.destinatarioForzado,
      huellaDestinatarios: audiencia.huellaDestinatarios,
    };
  }
}
