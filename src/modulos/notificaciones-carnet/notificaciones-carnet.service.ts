import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfiguracionCorreoNotificacionesSeccion } from '../../configuracion/interfaces/configuracion-app.interface';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { LoggerService } from '../../comun/logger/logger.service';
import { InformesRepository } from '../informes/informes.repository';
import {
  CambioCarnetCorreo,
  TipoCambioCarnetCorreo,
} from './interfaces/cambio-carnet-correo.interface';
import { NotificacionesCarnetRepositoryOracle } from './notificaciones-carnet.repository.oracle';
import { NotificacionesProgramadasRepository } from './notificaciones-programadas.repository';
import { AvisoProgramadoCarnet } from './interfaces/aviso-programado.interface';
import { calcularVencimiento } from './plazo-aviso';
import { separarCorreos } from '../../configuracion/listas-configuracion';
import { SlaCarnetService } from './sla-carnet.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { asuntoCarnet, htmlCarnet, textoCarnet } from './plantilla-carnet';
import { DatosPlantillaCarnet } from './interfaces/datos-plantilla-carnet.interface';

interface GrupoCambioCorreo {
  idPosicion: number;
  tipo: TipoCambioCarnetCorreo;
  usuario: string;
  origen: CambioCarnetCorreo['origen'];
  idInformes: number[];
  cambiosFrecuencia?: Map<number, { anterior: string | null; nueva: string }>;
}

@Injectable()
export class NotificacionesCarnetService implements OnModuleInit, OnModuleDestroy {
  private transporte?: nodemailer.Transporter;
  private smtpVerificado = false;
  private temporizador?: ReturnType<typeof setInterval>;
  private procesando = false;
  private cerrando = false;

  constructor(
    private readonly configuracion: ConfiguracionService,
    private readonly repositorio: NotificacionesCarnetRepositoryOracle,
    private readonly informes: InformesRepository,
    private readonly logger: LoggerService,
    private readonly programadas: NotificacionesProgramadasRepository,
    private readonly sla: SlaCarnetService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    if (cfg.destinatarioForzado) {
      this.logger.advertencia(
        'Destinatario temporal activo: todos los avisos de CARNET, incluido SLA, se redirigen al correo configurado.',
      );
    }
    if (cfg.escalonadosActivos) {
      this.temporizador = setInterval(
        () => void this.procesarPendientes(),
        cfg.intervaloSegundos * 1000,
      );
      this.temporizador.unref();
    }
    if (cfg.host.trim().length === 0) {
      this.logger.advertencia('Avisos de correo de CARNET desactivados: SMTP_HOST está vacío.');
      return;
    }

    try {
      this.transporte = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.puerto,
        secure: cfg.puerto === 465,
        requireTLS: cfg.puerto === 587,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        auth:
          cfg.usuario.trim().length > 0 ? { user: cfg.usuario, pass: cfg.contrasena } : undefined,
      });
      await this.transporte.verify();
      this.smtpVerificado = true;
      this.logger.info('Servicio SMTP de avisos de CARNET verificado.');
    } catch (error) {
      this.smtpVerificado = false;
      this.logger.advertencia('No se pudo verificar el servicio SMTP de avisos de CARNET.', {
        error: (error as Error).message,
      });
    }
  }

  onModuleDestroy(): void {
    this.cerrando = true;
    if (this.temporizador) clearInterval(this.temporizador);
    this.transporte?.close();
  }

  exigirSmtpPersonalizado(): void {
    if (!this.transporte || !this.configuracion.obtenerCorreoNotificaciones().remitente.trim()) {
      throw new ServiceUnavailableException('El servicio de correo no está configurado.');
    }
  }

  async enviarPersonalizado(
    destinatarios: string[],
    asunto: string,
    contenido: string,
    informe: string,
  ): Promise<string[]> {
    this.exigirSmtpPersonalizado();
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    const resultado = await this.transporte!.sendMail({
      from: cfg.remitente,
      ...(cfg.destinatarioForzado ? { to: cfg.destinatarioForzado } : { bcc: destinatarios }),
      subject: asunto,
      text: `SuKarne | NEXUS\n${asunto}\nInforme: ${informe}\n\n${contenido}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24313f">
        <div style="background:#00563f;color:white;padding:20px">SuKarne | NEXUS</div>
        <div style="padding:24px"><h2>${this.escaparHtml(asunto)}</h2>
        <p>Informe: ${this.escaparHtml(informe)}</p>
        <p>${this.escaparHtml(contenido).replace(/\r?\n/g, '<br>')}</p></div></div>`,
    });
    const aceptados = resultado.accepted as Array<string | { address: string }> | undefined;
    return (aceptados ?? []).map((valor) =>
      (typeof valor === 'string' ? valor : valor.address).toLowerCase(),
    );
  }

  async enviarNotificacion(
    destinatarios: string[],
    asunto: string,
    texto: string,
    html: string,
  ): Promise<void> {
    this.exigirSmtpPersonalizado();
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    const correos = this.validarDestinatarios(
      (cfg.destinatarioForzado ? [cfg.destinatarioForzado] : destinatarios).map((correo) =>
        correo.trim().toLowerCase(),
      ),
    );
    if (!correos.length) throw new Error('No hay destinatarios válidos.');
    const resultado = await this.transporte!.sendMail({
      from: cfg.remitente,
      ...(cfg.destinatarioForzado ? { to: correos } : { bcc: correos }),
      subject: asunto.replace(/[\r\n]+/g, ' '),
      text: texto,
      html,
    });
    const aceptados = (resultado.accepted ?? []) as Array<string | { address: string }>;
    const direcciones = new Set(
      aceptados.map((correo) =>
        (typeof correo === 'string' ? correo : correo.address).toLowerCase(),
      ),
    );
    if (correos.some((correo) => !direcciones.has(correo))) {
      throw new Error('SMTP no aceptó a todos los destinatarios.');
    }
  }

  // Best-effort: una falla de correo no debe revertir una asignación o una
  // eliminación que Oracle ya confirmó.
  async enviarCambios(
    cambios: CambioCarnetCorreo[],
    cfg = this.configuracion.obtenerCorreoNotificaciones(),
  ): Promise<void> {
    if (cambios.length === 0) return;

    if (cfg.escalonadosActivos && cambios.some((cambio) => cambio.tipo === 'asignacion')) {
      try {
        if (!(await this.programadas.disponible()))
          throw new Error('Faltan las tablas de avisos escalonados.');
        await this.programadas.registrar(
          cambios.filter((cambio) => !cambio.activacionDiferida),
          cfg,
        );
        void this.procesarPendientes();
      } catch (error) {
        // Oracle ya confirmó. No adelantar el aviso al usuario si no se pudo consultar/persistir la regla.
        this.logger.advertencia(
          'CARNET confirmado pero avisos NO registrados; requiere conciliación manual.',
          {
            cambios,
            error: (error as Error).message,
          },
        );
        return;
      }
      cambios = cambios.filter((cambio) => cambio.tipo !== 'asignacion');
      if (!cambios.length) return;
    }
    if (!this.transporte || !this.smtpVerificado) {
      this.logger.advertencia('Avisos de correo de CARNET omitidos: SMTP no disponible.', {
        cambios: cambios.length,
      });
      return;
    }
    if (cfg.remitente.trim().length === 0) {
      this.logger.advertencia('Avisos de correo de CARNET omitidos: SMTP_REMITENTE está vacío.', {
        cambios: cambios.length,
      });
      return;
    }

    for (const grupo of this.agrupar(cambios)) {
      try {
        const destinatarios = await this.resolverDestinatarios(grupo.idPosicion, cfg);
        if (destinatarios.length === 0) {
          this.logger.advertencia(
            'Aviso de correo de CARNET omitido: no hay destinatarios válidos.',
            {
              idPosicion: grupo.idPosicion,
            },
          );
          continue;
        }

        if (!(await this.enviarGrupo(grupo, destinatarios))) continue;
        this.logger.info('Aviso de correo de CARNET enviado.', {
          idPosicion: grupo.idPosicion,
          tipo: grupo.tipo,
          informes: grupo.idInformes.length,
          origen: grupo.origen,
        });
      } catch (error) {
        this.logger.advertencia('No se pudo enviar un aviso de correo de CARNET.', {
          idPosicion: grupo.idPosicion,
          tipo: grupo.tipo,
          informes: grupo.idInformes.length,
          error: (error as Error).message,
        });
      }
    }
  }

  private async enviarGrupo(
    grupo: GrupoCambioCorreo,
    destinatarios: string[],
    aviso?: AvisoProgramadoCarnet,
  ): Promise<boolean> {
    if (!this.transporte) throw new Error('SMTP no disponible.');
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    // También cubre avisos que ya tenían otros destinatarios guardados en la cola.
    destinatarios = this.validarDestinatarios(
      cfg.destinatarioForzado ? [cfg.destinatarioForzado] : destinatarios,
    );
    if (!destinatarios.length) throw new Error('No hay destinatarios válidos.');
    const cacheNombres = new Map<number, string | null>();
    let informes: Array<{ idInforme: number; nombre: string | null }> = [];
    for (let inicio = 0; inicio < grupo.idInformes.length; inicio += 10) {
      informes.push(
        ...(await Promise.all(
          grupo.idInformes.slice(inicio, inicio + 10).map(async (idInforme) => ({
            idInforme,
            nombre: await this.nombreInforme(idInforme, cacheNombres),
          })),
        )),
      );
    }
    if (aviso) {
      if (!(await this.programadas.renovarBloqueo(aviso)))
        throw new Error('El aviso fue tomado por otro proceso.');
      const detalles = await this.programadas.detallesPendientes(aviso.idAviso);
      const asignados = await this.repositorio.identificadoresAsignados(aviso.idPosicion);
      const pendientes = new Set(
        detalles
          .filter(
            (detalle) =>
              asignados.has(detalle.idInforme) &&
              (aviso.slaMinutos == null ||
                (detalle.idCarnet != null &&
                  detalle.idCarnet === asignados.get(detalle.idInforme))),
          )
          .map((detalle) => detalle.idInforme),
      );
      const retirados = informes
        .filter((informe) => !pendientes.has(informe.idInforme))
        .map((informe) => informe.idInforme);
      await this.programadas.cancelarInformes(aviso.idAviso, retirados);
      informes = informes.filter(
        (informe) => pendientes.has(informe.idInforme) && asignados.has(informe.idInforme),
      );
      if (!informes.length) return false;
    }
    const previo = aviso?.estado === 'INICIAL' || aviso?.estado === 'INICIAL_SLA';
    if (grupo.tipo === 'frecuencia') {
      const visibles = [];
      for (const informe of informes) {
        if (!(await this.sla.estaPendiente(grupo.idPosicion, informe.idInforme)))
          visibles.push(informe);
      }
      informes = visibles;
      if (!informes.length) return false;
    }
    const [asignaciones, usuarioAsignado, correoAsignado] = await Promise.all([
      grupo.tipo === 'eliminacion'
        ? Promise.resolve([])
        : this.informes.obtenerListadoPorUsuario(grupo.idPosicion),
      this.repositorio.usuarioPorPosicion(grupo.idPosicion),
      this.repositorio.obtenerCorreoPorPosicion(grupo.idPosicion),
    ]);
    const porInforme = new Map(asignaciones.map((asignacion) => [asignacion.fkVeo, asignacion]));
    const datos: DatosPlantillaCarnet = {
      tipo: previo ? 'aviso-inicial' : grupo.tipo,
      idPosicion: grupo.idPosicion,
      usuarioAsignado,
      correoAsignado,
      informes: informes.map((informe) => {
        const asignacion = porInforme.get(informe.idInforme);
        const frecuencia = grupo.cambiosFrecuencia?.get(informe.idInforme);
        return {
          idInforme: informe.idInforme,
          nombre: informe.nombre ?? '',
          frecuencia: frecuencia?.nueva ?? asignacion?.frecuencia ?? null,
          frecuenciaAnterior: frecuencia?.anterior ?? null,
          estatusInstalacion: asignacion?.estatusInstalacion ?? null,
        };
      }),
    };
    const resultado = await this.transporte.sendMail({
      from: cfg.remitente,
      to: destinatarios.join(', '),
      ...(aviso
        ? { messageId: `<carnet.${aviso.idAviso}.${aviso.estado.toLowerCase()}@nexus.local>` }
        : {}),
      subject: asuntoCarnet(datos),
      html: htmlCarnet(datos),
      text: textoCarnet(datos),
    });
    if (resultado.rejected?.length) throw new Error('SMTP rechazó uno o más destinatarios.');
    return true;
  }

  private async procesarPendientes(): Promise<void> {
    const cfg = this.configuracion.obtenerCorreoNotificaciones();
    if (this.procesando || this.cerrando || !cfg.escalonadosActivos) return;
    this.procesando = true;
    try {
      if (!(await this.programadas.disponible())) {
        this.logger.advertencia(
          'Avisos escalonados pausados: falta actualizar la estructura de SQL Server.',
        );
        return;
      }
      for (let procesados = 0; procesados < 20 && !this.cerrando; procesados++) {
        const aviso = await this.programadas.tomarPendiente();
        if (!aviso) break;
        try {
          if (aviso.estado === 'ACTIVACION') {
            await this.completarActivacion(aviso);
            continue;
          }
          if (!this.transporte || !cfg.remitente.trim()) throw new Error('SMTP no disponible.');
          if (aviso.estado === 'INICIAL' || aviso.estado === 'INICIAL_SLA') {
            calcularVencimiento(new Date(), aviso);
          }
          if (
            aviso.estado === 'USUARIO_SLA' &&
            (!aviso.fechaProgramada || new Date(aviso.fechaProgramada).getTime() > Date.now())
          ) {
            throw new Error('El plazo SLA aún no vence.');
          }
          const idInformes = await this.programadas.informesPendientes(aviso.idAviso);
          if (!idInformes.length) {
            await this.programadas.finalizar(aviso, []);
            continue;
          }
          let destinatarios: string[];
          if (cfg.destinatarioForzado) {
            destinatarios = this.validarDestinatarios([cfg.destinatarioForzado]);
          } else if (aviso.estado === 'INICIAL' || aviso.estado === 'INICIAL_SLA') {
            const iniciales = separarCorreos(aviso.correoInicial ?? '');
            destinatarios = this.validarDestinatarios(iniciales);
            if (destinatarios.length !== iniciales.length) {
              throw new Error('Uno o más destinatarios iniciales son inválidos.');
            }
          } else if (cfg.usarCorreoPosicion) {
            // No usar el destinatario genérico como sustituto silencioso del usuario final.
            destinatarios = this.validarDestinatarios([
              (await this.repositorio.obtenerCorreoPorPosicion(aviso.idPosicion)) ?? '',
            ]);
          } else {
            destinatarios = this.validarDestinatarios(cfg.destinatariosDefault);
          }
          if (!destinatarios.length) {
            await this.programadas.reintentar(
              aviso,
              'No hay correo válido para esta etapa. Revisar el destinatario o la posición en Oracle.',
            );
            continue;
          }
          const enviado = await this.enviarGrupo(
            {
              idPosicion: aviso.idPosicion,
              tipo: 'asignacion',
              usuario: aviso.usuario,
              origen: aviso.origen,
              idInformes,
            },
            destinatarios,
            aviso,
          );
          if (!enviado) {
            await this.programadas.finalizar(aviso, []);
          } else if (aviso.estado === 'INICIAL' || aviso.estado === 'INICIAL_SLA') {
            const fechaInicial = new Date();
            await this.programadas.confirmarInicial(
              aviso,
              fechaInicial,
              calcularVencimiento(fechaInicial, aviso),
            );
          } else if (aviso.estado === 'USUARIO_SLA') {
            await this.programadas.confirmarCorreoFinal(aviso, destinatarios);
            await this.completarActivacion(aviso);
          } else {
            await this.programadas.finalizar(aviso, destinatarios);
          }
          this.logger.info('Etapa de aviso CARNET procesada.', {
            idAviso: aviso.idAviso,
            etapa: aviso.estado,
            idPosicion: aviso.idPosicion,
            enviado,
          });
        } catch {
          await this.programadas.reintentar(
            aviso,
            aviso.estado === 'ACTIVACION'
              ? 'Correo final confirmado; falta completar la activación o sincronizar su espejo. Se reintentará sin reenviar el correo.'
              : 'No se completó el envío o su confirmación. Se reintentará automáticamente en 5 minutos.',
          );
          this.logger.advertencia('Aviso CARNET pendiente de reintento.', {
            idAviso: aviso.idAviso,
          });
        }
      }
    } catch (error) {
      this.logger.advertencia('No se pudo procesar la cola de avisos CARNET.', {
        error: (error as Error).message,
      });
    } finally {
      this.procesando = false;
    }
  }

  private async completarActivacion(aviso: AvisoProgramadoCarnet): Promise<void> {
    const cantidad = await this.sla.activar(aviso);
    await this.programadas.finalizar(
      aviso,
      cantidad ? separarCorreos(aviso.destinatarioFinal ?? '') : [],
    );
  }

  private agrupar(cambios: CambioCarnetCorreo[]): GrupoCambioCorreo[] {
    const grupos = new Map<string, GrupoCambioCorreo>();
    for (const cambio of cambios) {
      const clave = `${cambio.idPosicion}:${cambio.tipo}`;
      const existente = grupos.get(clave);
      if (existente) {
        if (cambio.tipo === 'frecuencia' && cambio.frecuenciaNueva) {
          existente.cambiosFrecuencia?.set(cambio.idInforme, {
            anterior: cambio.frecuenciaAnterior ?? null,
            nueva: cambio.frecuenciaNueva,
          });
        }
        if (!existente.idInformes.includes(cambio.idInforme)) {
          existente.idInformes.push(cambio.idInforme);
        }
        continue;
      }
      grupos.set(clave, {
        idPosicion: cambio.idPosicion,
        tipo: cambio.tipo,
        usuario: cambio.usuario,
        origen: cambio.origen,
        idInformes: [cambio.idInforme],
        cambiosFrecuencia: new Map(
          cambio.tipo === 'frecuencia' && cambio.frecuenciaNueva
            ? [
                [
                  cambio.idInforme,
                  { anterior: cambio.frecuenciaAnterior ?? null, nueva: cambio.frecuenciaNueva },
                ],
              ]
            : [],
        ),
      });
    }
    return [...grupos.values()];
  }

  private async resolverDestinatarios(
    idPosicion: number,
    cfg: ConfiguracionCorreoNotificacionesSeccion,
  ): Promise<string[]> {
    if (cfg.destinatarioForzado) {
      return this.validarDestinatarios([cfg.destinatarioForzado]);
    }
    let correos: string[] = [];
    if (cfg.usarCorreoPosicion) {
      try {
        const correo = await this.repositorio.obtenerCorreoPorPosicion(idPosicion);
        if (correo) correos = [correo];
      } catch (error) {
        this.logger.advertencia('No se pudo consultar el correo de la posición.', {
          idPosicion,
          error: (error as Error).message,
        });
      }
    }

    if (correos.length === 0) correos = cfg.destinatariosDefault;
    return this.validarDestinatarios(correos);
  }

  private validarDestinatarios(correos: string[]): string[] {
    const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validos = correos.filter((correo) => correoValido.test(correo));
    if (validos.length !== correos.length) {
      this.logger.advertencia('Se omitieron destinatarios de correo con formato inválido.', {
        recibidos: correos.length,
        validos: validos.length,
      });
    }
    return [...new Set(validos)];
  }

  private async nombreInforme(
    idInforme: number,
    cache: Map<number, string | null>,
  ): Promise<string | null> {
    if (cache.has(idInforme)) return cache.get(idInforme) ?? null;
    try {
      const informe = await this.informes.obtenerPorSkVeo(idInforme);
      const nombre = informe?.nombre ?? null;
      cache.set(idInforme, nombre);
      return nombre;
    } catch (error) {
      this.logger.advertencia('No se pudo resolver el nombre del informe para el aviso.', {
        idInforme,
        error: (error as Error).message,
      });
      cache.set(idInforme, null);
      return null;
    }
  }

  private escaparHtml(valor: string): string {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
