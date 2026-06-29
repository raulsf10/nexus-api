import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { ParametroSpInterface } from './interfaces/parametro-sp.interface';

const NOMBRE_POOL = 'NEXUS_ORACLE_POOL';

@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy {
  private pool?: oracledb.Pool;

  constructor(
    private readonly configuracion: ConfiguracionService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.configuracion.obtenerOracle();

    if (cfg.libDir && cfg.libDir.trim().length > 0) {
      try {
        oracledb.initOracleClient({ libDir: cfg.libDir });
        this.logger.info('Oracle Client inicializado en modo Thick', { libDir: cfg.libDir });
      } catch (error) {
        // NJS-077: initOracleClient ya fue llamado (hot-reload en dev). Ignorar.
        const yaInicializado = (error as Error).message?.includes('NJS-077');
        if (!yaInicializado) {
          this.logger.error('No fue posible inicializar Oracle Client (modo Thick)', error, {
            libDir: cfg.libDir,
          });
          throw error;
        }
      }
    }

    try {
      this.pool = await oracledb.createPool({
        poolAlias: NOMBRE_POOL,
        user: cfg.usuario,
        password: cfg.contrasena,
        connectString: `${cfg.host}:${cfg.puerto}/${cfg.servicio}`,
        poolMin: cfg.poolMin,
        poolMax: cfg.poolMax,
        poolIncrement: 1,
      });
      this.logger.info('Pool Oracle inicializado', {
        host: cfg.host,
        servicio: cfg.servicio,
        poolMin: cfg.poolMin,
        poolMax: cfg.poolMax,
        modo: cfg.libDir ? 'thick' : 'thin',
      });
    } catch (error) {
      this.logger.error('No fue posible crear el pool de Oracle', error, {
        host: cfg.host,
        servicio: cfg.servicio,
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.close(10);
      this.logger.info('Pool Oracle cerrado');
    } catch (error) {
      this.logger.error('Error al cerrar el pool de Oracle', error);
    }
  }

  async ejecutar<T = Record<string, unknown>>(
    sql: string,
    parametros: Record<string, unknown> = {},
  ): Promise<T[]> {
    const conexion = await this.obtenerConexion();
    try {
      const resultado = await conexion.execute<T>(sql, parametros as oracledb.BindParameters, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });
      return (resultado.rows ?? []) as T[];
    } catch (error) {
      this.logger.error('Error ejecutando SQL en Oracle', error, {
        sql,
        parametros: this.sanitizarParametros(parametros),
      });
      throw new ExcepcionNegocio(
        CodigosError.ORACLE_ERROR,
        'Error al ejecutar consulta en Oracle.',
        500,
      );
    } finally {
      await this.cerrarConexion(conexion);
    }
  }

  async ejecutarSp(nombreSp: string, parametros: ParametroSpInterface[]): Promise<void> {
    const conexion = await this.obtenerConexion();
    try {
      const binds = this.construirBindsSp(parametros);
      const placeholders = parametros.map((p) => `:${p.nombre}`).join(', ');
      const sql = `BEGIN ${nombreSp}(${placeholders}); END;`;
      await conexion.execute(sql, binds, { autoCommit: true });
    } catch (error) {
      this.logger.error('Error ejecutando SP en Oracle', error, {
        sp: nombreSp,
        parametros: this.sanitizarParametros(
          Object.fromEntries(parametros.map((p) => [p.nombre, p.valor])),
        ),
      });
      throw new ExcepcionNegocio(
        CodigosError.ORACLE_ERROR,
        `Error al ejecutar el stored procedure ${nombreSp}.`,
        500,
      );
    } finally {
      await this.cerrarConexion(conexion);
    }
  }

  private construirBindsSp(parametros: ParametroSpInterface[]): oracledb.BindParameters {
    const binds: Record<string, oracledb.BindParameter> = {};
    for (const p of parametros) {
      binds[p.nombre] = {
        val: p.valor,
        type: p.tipo === 'numero' ? oracledb.NUMBER : oracledb.STRING,
        dir: p.direccion === 'out' ? oracledb.BIND_OUT : oracledb.BIND_IN,
      };
    }
    return binds;
  }

  private async obtenerConexion(): Promise<oracledb.Connection> {
    if (!this.pool) {
      throw new ExcepcionNegocio(
        CodigosError.ORACLE_ERROR,
        'El pool de Oracle no está inicializado.',
        500,
      );
    }
    return this.pool.getConnection();
  }

  private async cerrarConexion(conexion: oracledb.Connection): Promise<void> {
    try {
      await conexion.close();
    } catch (error) {
      this.logger.advertencia('No fue posible liberar la conexión Oracle al pool', {
        error: (error as Error).message,
      });
    }
  }

  private sanitizarParametros(parametros: Record<string, unknown>): Record<string, unknown> {
    const clavesSensibles = ['contrasena', 'contraseña', 'password', 'secret'];
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(parametros)) {
      limpio[clave] = clavesSensibles.includes(clave.toLowerCase()) ? '[REDACTADO]' : valor;
    }
    return limpio;
  }
}
