import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EjecutorSqlServer,
  SqlServerService,
} from '../../base-datos/sql-server/sql-server.service';
import {
  AvisoProgramadoCarnet,
  InformePendienteCarnet,
} from './interfaces/aviso-programado.interface';
import { ConfiguracionCorreoNotificacionesSeccion } from '../../configuracion/interfaces/configuracion-app.interface';
import { CambioCarnetCorreo } from './interfaces/cambio-carnet-correo.interface';

@Injectable()
export class NotificacionesProgramadasRepository {
  constructor(private readonly sql: SqlServerService) {}

  async disponible(): Promise<boolean> {
    const filas = await this.sql.ejecutar<{ disponible: number }>(`
      SELECT CASE WHEN OBJECT_ID('dbo.CI_CARNET_AVISO','U') IS NOT NULL
        AND OBJECT_ID('dbo.CI_CARNET_AVISO_INFORME','U') IS NOT NULL
        AND COL_LENGTH('dbo.CI_CARNET_AVISO','slaHoras') IS NOT NULL
        AND COL_LENGTH('dbo.CI_CARNET_AVISO','slaMinutos') IS NOT NULL
        AND COL_LENGTH('dbo.CI_CARNET_AVISO','fechaCorreoFinal') IS NOT NULL
        AND COL_LENGTH('dbo.CI_CARNET_AVISO_INFORME','idCarnet') IS NOT NULL
        AND EXISTS (SELECT 1 FROM sys.check_constraints
          WHERE parent_object_id=OBJECT_ID('dbo.CI_CARNET_AVISO')
            AND name='ck_carnet_aviso_estado_v2' AND is_disabled=0)
        AND NOT EXISTS (SELECT 1 FROM sys.check_constraints
          WHERE parent_object_id=OBJECT_ID('dbo.CI_CARNET_AVISO') AND is_disabled=0
            AND CHARINDEX('[estado]',definition)>0 AND CHARINDEX('PREPARADO',definition)=0)
        AND COL_LENGTH('dbo.CI_CARNET_AVISO','correoInicial') >= 1000
        THEN 1 ELSE 0 END disponible`);
    return filas[0]?.disponible === 1;
  }

  async registrar(
    cambios: CambioCarnetCorreo[],
    configuracion: Pick<
      ConfiguracionCorreoNotificacionesSeccion,
      'zonaHoraria' | 'slaMinutos' | 'destinatariosIniciales' | 'informesSla'
    >,
    prepararSla = false,
  ): Promise<string[]> {
    const informesSla = new Set(configuracion.informesSla);
    return this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      const avisos: string[] = [];
      const grupos = new Map<
        string,
        { cambio: CambioCarnetCorreo; aplicaSla: boolean; informes: Map<number, string | null> }
      >();
      for (const cambio of cambios) {
        if (cambio.tipo === 'eliminacion') {
          // Ya se canceló mientras la fila Oracle estaba bloqueada, antes del retiro.
          continue;
        }
        const aplicaSla = informesSla.has(cambio.idInforme);
        if (aplicaSla && (!prepararSla || !cambio.idCarnet)) {
          throw new Error('La asignación con SLA debe registrarse inactiva antes de confirmarse.');
        }
        const clave = `${cambio.idPosicion}:${aplicaSla}`;
        let grupo = grupos.get(clave);
        if (!grupo) {
          grupo = { cambio, aplicaSla, informes: new Map() };
          grupos.set(clave, grupo);
        }
        grupo.informes.set(cambio.idInforme, cambio.idCarnet ?? null);
      }
      for (const grupo of grupos.values()) {
        const idAviso = randomUUID();
        await ejecutar(
          `INSERT INTO dbo.CI_CARNET_AVISO
          (idAviso,idPosicion,correoInicial,diasHabiles,slaMinutos,zonaHoraria,usuario,origen,estado,fechaProgramada,ultimoError)
          VALUES (@idAviso,@idPosicion,@correoInicial,0,@slaMinutos,@zonaHoraria,@usuario,@origen,@estado,
            CASE WHEN @estado='USUARIO' THEN SYSUTCDATETIME() ELSE NULL END,
            CASE WHEN @estado='PREPARADO' THEN N'Pendiente de confirmar el alta Oracle. Si persiste, requiere conciliación.' ELSE NULL END)`,
          {
            idAviso,
            idPosicion: grupo.cambio.idPosicion,
            correoInicial: grupo.aplicaSla ? configuracion.destinatariosIniciales.join(',') : null,
            slaMinutos: grupo.aplicaSla ? configuracion.slaMinutos : null,
            zonaHoraria: configuracion.zonaHoraria,
            usuario: grupo.cambio.usuario,
            origen: grupo.cambio.origen,
            estado: grupo.aplicaSla ? 'PREPARADO' : 'USUARIO',
          },
        );
        const informes = [...grupo.informes];
        for (let inicio = 0; inicio < informes.length; inicio += 500) {
          const parametros: Record<string, unknown> = { idAviso };
          const valores = informes
            .slice(inicio, inicio + 500)
            .map(([idInforme, idCarnet], indice) => {
              parametros[`informe${indice}`] = idInforme;
              parametros[`carnet${indice}`] = idCarnet;
              return `(@idAviso,@informe${indice},@carnet${indice})`;
            });
          await ejecutar(
            `INSERT INTO dbo.CI_CARNET_AVISO_INFORME (idAviso,idInforme,idCarnet) VALUES ${valores.join(',')}`,
            parametros,
          );
        }
        await this.cancelarAnteriores(ejecutar, idAviso, grupo.cambio.idPosicion);
        avisos.push(idAviso);
      }
      return avisos;
    });
  }

  private async cancelarAnteriores(
    ejecutar: EjecutorSqlServer,
    idAviso: string,
    idPosicion: number,
  ): Promise<void> {
    await ejecutar(
      `UPDATE anterior SET cancelado=1 FROM dbo.CI_CARNET_AVISO_INFORME anterior
      INNER JOIN dbo.CI_CARNET_AVISO aviso ON aviso.idAviso=anterior.idAviso
      INNER JOIN dbo.CI_CARNET_AVISO_INFORME nuevo ON nuevo.idInforme=anterior.idInforme AND nuevo.idAviso=@idAviso
      WHERE aviso.idPosicion=@idPosicion AND aviso.idAviso<>@idAviso
        AND aviso.estado IN ('PREPARADO','INICIAL_SLA','USUARIO_SLA','ACTIVACION','INICIAL','USUARIO')`,
      { idAviso, idPosicion },
    );
    await ejecutar(
      `UPDATE aviso SET estado='CANCELADO',fechaFinal=SYSUTCDATETIME(),
      bloqueo=NULL,bloqueoHasta=NULL,ultimoError=NULL FROM dbo.CI_CARNET_AVISO aviso
      WHERE aviso.idPosicion=@idPosicion AND aviso.idAviso<>@idAviso
        AND aviso.estado IN ('PREPARADO','INICIAL_SLA','USUARIO_SLA','ACTIVACION','INICIAL','USUARIO')
        AND NOT EXISTS (SELECT 1 FROM dbo.CI_CARNET_AVISO_INFORME d WHERE d.idAviso=aviso.idAviso AND d.cancelado=0)`,
      { idAviso, idPosicion },
    );
  }

  async confirmarPreparados(idAvisos: string[]): Promise<void> {
    await this.sql.ejecutarEnTransaccion(async (ejecutar) => {
      for (const idAviso of idAvisos) {
        await ejecutar(
          `UPDATE dbo.CI_CARNET_AVISO SET estado='INICIAL_SLA',ultimoError=NULL,
          proximoIntento=SYSUTCDATETIME() WHERE idAviso=@idAviso AND estado='PREPARADO'`,
          { idAviso },
        );
      }
    });
  }

  async tieneActivacionPendiente(idPosicion: number, idInforme: number): Promise<boolean> {
    const filas = await this.sql.ejecutar(
      `SELECT TOP (1) a.idAviso FROM dbo.CI_CARNET_AVISO a
      INNER JOIN dbo.CI_CARNET_AVISO_INFORME d ON d.idAviso=a.idAviso
      WHERE a.idPosicion=@idPosicion AND d.idInforme=@idInforme AND d.cancelado=0
        AND a.estado IN ('PREPARADO','INICIAL_SLA','USUARIO_SLA','ACTIVACION')`,
      { idPosicion, idInforme },
    );
    return filas.length > 0;
  }

  async cancelarAsignacion(idPosicion: number, idInforme: number): Promise<void> {
    await this.sql.ejecutarEnTransaccion((ejecutar) =>
      this.cancelarRelacion(ejecutar, idPosicion, idInforme),
    );
  }

  private async cancelarRelacion(
    ejecutar: EjecutorSqlServer,
    idPosicion: number,
    idInforme: number,
  ): Promise<void> {
    await ejecutar(
      `UPDATE detalle SET cancelado=1 FROM dbo.CI_CARNET_AVISO_INFORME detalle
      INNER JOIN dbo.CI_CARNET_AVISO aviso ON aviso.idAviso=detalle.idAviso
      WHERE aviso.idPosicion=@idPosicion AND detalle.idInforme=@idInforme
        AND aviso.estado IN ('PREPARADO','INICIAL_SLA','USUARIO_SLA','ACTIVACION','INICIAL','USUARIO')`,
      { idPosicion, idInforme },
    );
    await ejecutar(
      `UPDATE aviso SET estado='CANCELADO',fechaFinal=SYSUTCDATETIME(),
      bloqueo=NULL,bloqueoHasta=NULL,ultimoError=NULL FROM dbo.CI_CARNET_AVISO aviso
      WHERE aviso.idPosicion=@idPosicion
        AND aviso.estado IN ('PREPARADO','INICIAL_SLA','USUARIO_SLA','ACTIVACION','INICIAL','USUARIO')
        AND NOT EXISTS (SELECT 1 FROM dbo.CI_CARNET_AVISO_INFORME detalle
          WHERE detalle.idAviso=aviso.idAviso AND detalle.cancelado=0)`,
      { idPosicion },
    );
  }

  async tomarPendiente(): Promise<AvisoProgramadoCarnet | null> {
    const filas = await this.sql.ejecutar<AvisoProgramadoCarnet>(
      `
      ;WITH siguiente AS (
        SELECT TOP (1) * FROM dbo.CI_CARNET_AVISO WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
        WHERE estado IN ('INICIAL','USUARIO','INICIAL_SLA','USUARIO_SLA','ACTIVACION')
          AND proximoIntento<=SYSUTCDATETIME()
          AND (estado IN ('INICIAL','INICIAL_SLA') OR fechaProgramada<=SYSUTCDATETIME())
          AND (bloqueoHasta IS NULL OR bloqueoHasta<SYSUTCDATETIME())
        ORDER BY proximoIntento,fechaCreacion
      )
      UPDATE siguiente SET bloqueo=@bloqueo,bloqueoHasta=DATEADD(MINUTE,5,SYSUTCDATETIME()),
        intentos=intentos+1 OUTPUT inserted.*`,
      { bloqueo: randomUUID() },
    );
    return filas[0] ?? null;
  }

  async informesPendientes(idAviso: string): Promise<number[]> {
    const filas = await this.detallesPendientes(idAviso);
    return filas.map((fila) => fila.idInforme);
  }

  async detallesPendientes(idAviso: string): Promise<InformePendienteCarnet[]> {
    return this.sql.ejecutar<InformePendienteCarnet>(
      `SELECT idInforme,idCarnet FROM dbo.CI_CARNET_AVISO_INFORME
      WHERE idAviso=@idAviso AND cancelado=0 ORDER BY idInforme`,
      { idAviso },
    );
  }

  async detalleVigente(aviso: AvisoProgramadoCarnet, idInforme: number): Promise<boolean> {
    const filas = await this.sql.ejecutar(
      `SELECT d.idInforme FROM dbo.CI_CARNET_AVISO_INFORME d
      INNER JOIN dbo.CI_CARNET_AVISO a ON a.idAviso=d.idAviso
      WHERE a.idAviso=@idAviso AND a.bloqueo=@bloqueo AND a.estado='ACTIVACION'
        AND d.idInforme=@idInforme AND d.cancelado=0`,
      { idAviso: aviso.idAviso, bloqueo: aviso.bloqueo, idInforme },
    );
    return filas.length === 1;
  }

  async renovarBloqueo(aviso: AvisoProgramadoCarnet): Promise<boolean> {
    const filas = await this.sql.ejecutar(
      `UPDATE dbo.CI_CARNET_AVISO
      SET bloqueoHasta=DATEADD(MINUTE,5,SYSUTCDATETIME()) OUTPUT inserted.idAviso
      WHERE idAviso=@idAviso AND bloqueo=@bloqueo
        AND estado IN ('INICIAL','USUARIO','INICIAL_SLA','USUARIO_SLA','ACTIVACION')`,
      { idAviso: aviso.idAviso, bloqueo: aviso.bloqueo },
    );
    return filas.length === 1;
  }

  async cancelarInformes(idAviso: string, idInformes: number[]): Promise<void> {
    for (const idInforme of idInformes) {
      await this.sql.ejecutar(
        `UPDATE dbo.CI_CARNET_AVISO_INFORME SET cancelado=1
        WHERE idAviso=@idAviso AND idInforme=@idInforme`,
        { idAviso, idInforme },
      );
    }
  }

  async confirmarInicial(
    aviso: AvisoProgramadoCarnet,
    fechaInicial: Date,
    fechaProgramada: Date,
  ): Promise<void> {
    const filas = await this.sql.ejecutar(
      `UPDATE dbo.CI_CARNET_AVISO SET estado=@estadoSiguiente,fechaInicial=@fechaInicial,
      fechaProgramada=@fechaProgramada,proximoIntento=@fechaProgramada,bloqueo=NULL,bloqueoHasta=NULL,
      ultimoError=NULL OUTPUT inserted.idAviso
      WHERE idAviso=@idAviso AND bloqueo=@bloqueo AND estado=@estadoActual`,
      {
        idAviso: aviso.idAviso,
        bloqueo: aviso.bloqueo,
        fechaInicial,
        fechaProgramada,
        estadoActual: aviso.estado,
        estadoSiguiente: aviso.estado === 'INICIAL_SLA' ? 'USUARIO_SLA' : 'USUARIO',
      },
    );
    if (filas.length !== 1)
      throw new Error('No se pudo confirmar el aviso inicial; bloqueo perdido.');
  }

  async confirmarCorreoFinal(aviso: AvisoProgramadoCarnet, destinatarios: string[]): Promise<void> {
    const filas = await this.sql.ejecutar<{ fechaCorreoFinal: Date }>(
      `UPDATE dbo.CI_CARNET_AVISO SET estado='ACTIVACION',fechaCorreoFinal=SYSUTCDATETIME(),
      destinatarioFinal=@destinatarios,ultimoError=NULL OUTPUT inserted.fechaCorreoFinal
      WHERE idAviso=@idAviso AND bloqueo=@bloqueo AND estado='USUARIO_SLA'`,
      { idAviso: aviso.idAviso, bloqueo: aviso.bloqueo, destinatarios: destinatarios.join(', ') },
    );
    if (filas.length !== 1)
      throw new Error('No se pudo confirmar el correo final; bloqueo perdido.');
    aviso.estado = 'ACTIVACION';
    aviso.fechaCorreoFinal = filas[0].fechaCorreoFinal;
    aviso.destinatarioFinal = destinatarios.join(', ');
  }

  async finalizar(aviso: AvisoProgramadoCarnet, destinatarios: string[]): Promise<void> {
    const filas = await this.sql.ejecutar(
      `UPDATE dbo.CI_CARNET_AVISO SET estado=@estado,fechaFinal=SYSUTCDATETIME(),
      destinatarioFinal=COALESCE(@destinatarios,destinatarioFinal),bloqueo=NULL,bloqueoHasta=NULL,ultimoError=NULL
      OUTPUT inserted.idAviso WHERE idAviso=@idAviso AND bloqueo=@bloqueo AND estado=@estadoActual`,
      {
        idAviso: aviso.idAviso,
        bloqueo: aviso.bloqueo,
        estado: destinatarios.length ? 'ENVIADO' : 'CANCELADO',
        destinatarios: destinatarios.join(', ') || null,
        estadoActual: aviso.estado,
      },
    );
    if (filas.length !== 1) throw new Error('No se pudo finalizar el aviso; bloqueo perdido.');
  }

  async reintentar(aviso: AvisoProgramadoCarnet, motivo: string): Promise<void> {
    await this.sql.ejecutar(
      `UPDATE dbo.CI_CARNET_AVISO SET ultimoError=@motivo,
      proximoIntento=DATEADD(MINUTE,5,SYSUTCDATETIME()),bloqueo=NULL,bloqueoHasta=NULL
      WHERE idAviso=@idAviso AND bloqueo=@bloqueo`,
      { idAviso: aviso.idAviso, bloqueo: aviso.bloqueo, motivo },
    );
  }

  async consultar(pagina: number) {
    const [conteo, registros] = await Promise.all([
      this.sql.ejecutar<{ total: number }>('SELECT COUNT(*) total FROM dbo.CI_CARNET_AVISO'),
      this.sql.ejecutar(
        `SELECT idAviso,idPosicion,correoInicial,diasHabiles,slaHoras,slaMinutos,zonaHoraria,usuario,origen,estado,
        fechaCreacion,fechaInicial,fechaProgramada,fechaCorreoFinal,fechaFinal,destinatarioFinal,intentos,ultimoError,
        (SELECT COUNT(*) FROM dbo.CI_CARNET_AVISO_INFORME d WHERE d.idAviso=a.idAviso AND d.cancelado=0) informes,
        (SELECT COUNT(*) FROM dbo.CI_CARNET_AVISO_INFORME d WHERE d.idAviso=a.idAviso AND d.cancelado=1) cancelados
        FROM dbo.CI_CARNET_AVISO a ORDER BY fechaCreacion DESC,idAviso
        OFFSET @inicio ROWS FETCH NEXT 25 ROWS ONLY`,
        { inicio: (pagina - 1) * 25 },
      ),
    ]);
    return { registros, total: conteo[0]?.total ?? 0, pagina, tamanioPagina: 25 };
  }
}
