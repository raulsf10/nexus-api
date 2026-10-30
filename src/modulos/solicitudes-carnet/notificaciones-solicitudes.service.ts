import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { LoggerService } from '../../comun/logger/logger.service';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { OperacionCarga } from '../carga-masiva/enums/operacion-carga.enum';
import { NotificacionesCarnetService } from '../notificaciones-carnet/notificaciones-carnet.service';
import { ExcepcionesNotificacionesService } from '../notificaciones-carnet/excepciones-notificaciones.service';
import { MODULO_SEGUIMIENTO_SOLICITUDES_CARNET } from './solicitudes-carnet.constantes';
import { PermisosPosicionRepository } from '../autenticacion/permisos-posicion.repository';

type EventoSolicitud =
  | 'creada'
  | 'reabierta'
  | 'nueva-version'
  | 'aprobada'
  | 'parcial'
  | 'rechazada';

export interface AvisoSolicitud {
  filas: Array<{ idInforme: number; aprobada?: boolean }>;
  evento: EventoSolicitud;
  idSolicitud: number;
  usuarioSolicitante: string;
  operacion: OperacionCarga;
  usuarioRevisor?: string;
  comentario?: string | null;
  aprobadas?: number;
  noAprobadas?: number;
}

interface CorreoUsuario {
  USUARIO: string;
  CORREO: string | null;
}

@Injectable()
export class NotificacionesSolicitudesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly correo: NotificacionesCarnetService,
    private readonly configuracion: ConfiguracionService,
    private readonly logger: LoggerService,
    private readonly posiciones: PermisosPosicionRepository,
    private readonly excepciones: ExcepcionesNotificacionesService,
  ) {}

  // Se invoca después del commit: un fallo SMTP no debe repetir los movimientos.
  async notificar(datos: AvisoSolicitud): Promise<string | undefined> {
    try {
      const permitidos = new Set(
        await this.excepciones.permitidos(datos.filas.map((fila) => fila.idInforme)),
      );
      const filas = datos.filas.filter((fila) => permitidos.has(fila.idInforme));
      if (!filas.length) return undefined;
      if (datos.aprobadas !== undefined) {
        datos = {
          ...datos,
          aprobadas: filas.filter((fila) => fila.aprobada).length,
          noAprobadas: filas.filter((fila) => !fila.aprobada).length,
        };
      }
      const forzado = this.configuracion.obtenerCorreoNotificaciones().destinatarioForzado;
      const revisores = ['creada', 'reabierta', 'nueva-version'].includes(datos.evento);
      const usuarios = forzado
        ? [{ USUARIO: 'destinatario-configurado', CORREO: forzado }]
        : await this.obtenerCorreos(revisores, datos.usuarioSolicitante);
      const conCorreo = new Set<string>();
      const destinatarios = new Set<string>();
      for (const usuario of usuarios) {
        for (const correo of (usuario.CORREO ?? '').split(/[,;]/)) {
          const direccion = correo.trim().toLowerCase();
          if (!isEmail(direccion)) continue;
          destinatarios.add(direccion);
          conCorreo.add(usuario.USUARIO.toLowerCase());
        }
      }
      const sinCorreo = [
        ...new Set(usuarios.map((usuario) => usuario.USUARIO.toLowerCase())),
      ].filter((usuario) => !conCorreo.has(usuario));
      if (!destinatarios.size) throw new Error('No se encontraron correos válidos.');
      const titulos: Record<EventoSolicitud, string> = {
        creada: 'Nueva solicitud',
        reabierta: 'Solicitud reabierta',
        'nueva-version': 'Nueva versión de solicitud',
        aprobada: 'Solicitud aprobada',
        parcial: 'Solicitud aprobada parcialmente',
        rechazada: 'Solicitud rechazada',
      };
      const asunto = `${titulos[datos.evento]} #${datos.idSolicitud} | Carnet`;
      const lineas = [
        `Solicitante: ${datos.usuarioSolicitante}`,
        `Movimiento: ${datos.operacion === OperacionCarga.ASIGNACION ? 'Asignar informes' : 'Eliminar informes'}`,
        ...(datos.usuarioRevisor ? [`Revisó: ${datos.usuarioRevisor}`] : []),
        ...(datos.aprobadas !== undefined ? [`Aprobados: ${datos.aprobadas}`] : []),
        ...(datos.noAprobadas !== undefined ? [`No aprobados: ${datos.noAprobadas}`] : []),
        ...(datos.comentario
          ? [
              `${datos.evento === 'rechazada' ? 'Motivo del rechazo' : 'Comentario'}: ${datos.comentario}`,
            ]
          : []),
        revisores
          ? 'Consulta la solicitud en Seguimiento.'
          : 'Consulta el detalle en Mis solicitudes.',
      ];
      const texto = `SuKarne | Carnet\n\n${asunto}\n\n${lineas.join('\n\n')}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#263244">
        <div style="background:#a81b24;color:white;padding:20px">SuKarne | Carnet</div>
        <div style="padding:24px"><h2>${this.escaparHtml(asunto)}</h2>
        ${lineas.map((linea) => `<p>${this.escaparHtml(linea).replace(/\r?\n/g, '<br>')}</p>`).join('')}
        </div></div>`;
      await this.correo.enviarNotificacion([...destinatarios], asunto, texto, html, [
        ...permitidos,
      ]);
      if (sinCorreo.length) {
        this.logger.advertencia('Solicitud notificada con usuarios sin correo válido.', {
          idSolicitud: datos.idSolicitud,
          evento: datos.evento,
          usuarios: sinCorreo,
        });
        return 'Solicitud guardada. Algunos destinatarios no tienen correo válido.';
      }
      return undefined;
    } catch (error) {
      this.logger.advertencia('No se pudo completar el aviso de la solicitud.', {
        idSolicitud: datos.idSolicitud,
        evento: datos.evento,
        error: (error as Error).message,
      });
      return 'Solicitud guardada. No se pudo completar el envío del correo.';
    }
  }

  private async obtenerCorreos(revisores: boolean, usuario: string): Promise<CorreoUsuario[]> {
    const correos = await this.oracle.ejecutar<CorreoUsuario>(
      `SELECT DISTINCT a.usuario, c.correo
       FROM (
         ${
           revisores
             ? 'SELECT DISTINCT LOWER(TRIM(usuario)) usuario FROM dwh_suka.dim_ci_admin WHERE modulo = :modulo AND TRIM(usuario) IS NOT NULL'
             : 'SELECT LOWER(TRIM(:usuario)) usuario FROM dual'
         }
       ) a
       LEFT JOIN dwh_suka.dim_hk_usuarios_windows w
         ON LOWER(TRIM(w.sk_usuario_win)) = a.usuario
       LEFT JOIN dwh_suka.stg_rh_vw_ctl_plantillacorreo c
         ON TRIM(c.posicion) = TO_CHAR(w.fk_empleado)`,
      revisores ? { modulo: MODULO_SEGUIMIENTO_SOLICITUDES_CARNET } : { usuario },
    );
    if (!revisores) return correos;
    const ids = [
      ...new Set(
        (await this.posiciones.obtenerTodos())
          .filter((permiso) => permiso.modulo === MODULO_SEGUIMIENTO_SOLICITUDES_CARNET)
          .map((permiso) => Number(permiso.idPosicion)),
      ),
    ];
    for (let inicio = 0; inicio < ids.length; inicio += 500) {
      const parametros = Object.fromEntries(
        ids.slice(inicio, inicio + 500).map((id, indice) => [`posicion${indice}`, id]),
      );
      correos.push(
        ...(await this.oracle.ejecutar<CorreoUsuario>(
          `SELECT DISTINCT LOWER(TRIM(w.sk_usuario_win)) usuario, c.correo
         FROM dwh_suka.dim_hk_usuarios_windows w
         LEFT JOIN dwh_suka.stg_rh_vw_ctl_plantillacorreo c ON TRIM(c.posicion)=TO_CHAR(w.fk_empleado)
         WHERE w.fk_empleado IN (${Object.keys(parametros)
           .map((clave) => `:${clave}`)
           .join(',')})
         AND TRIM(w.sk_usuario_win) IS NOT NULL
         AND EXISTS (SELECT 1 FROM dwh_suka.stg_rh_posisiones_activas p WHERE p.idobj=w.fk_empleado)`,
          parametros,
        )),
      );
    }
    return correos;
  }

  private escaparHtml(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
