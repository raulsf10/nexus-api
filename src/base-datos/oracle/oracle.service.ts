import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { ParametroSpInterface } from './interfaces/parametro-sp.interface';

const NOMBRE_POOL = 'NEXUS_ORACLE_POOL';

// Abstrae el destino de una operación Oracle: puede ser el servicio (cada
// operación con su propia conexión y autoCommit) o una transacción en curso
// (todas las operaciones sobre la misma conexión, commit/rollback al final).
export interface EjecutorOracle {
  ejecutar<T = Record<string, unknown>>(
    sql: string,
    parametros?: Record<string, unknown>,
  ): Promise<T[]>;
  ejecutarSp(nombreSp: string, parametros: ParametroSpInterface[]): Promise<void>;
}

@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy, EjecutorOracle {
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
      return await this.correrConsulta<T>(conexion, sql, parametros, true);
    } finally {
      await this.cerrarConexion(conexion);
    }
  }

  async ejecutarSp(nombreSp: string, parametros: ParametroSpInterface[]): Promise<void> {
    const conexion = await this.obtenerConexion();
    try {
      await this.correrSp(conexion, nombreSp, parametros, true);
    } finally {
      await this.cerrarConexion(conexion);
    }
  }

  // Ejecuta `trabajo` con todas sus operaciones sobre una única conexión sin
  // autoCommit. Si `trabajo` resuelve, hace commit; si lanza, hace rollback y
  // re-lanza. Es todo-o-nada: pensado para lotes (carga masiva).
  async ejecutarEnTransaccion<T>(trabajo: (ejecutor: EjecutorOracle) => Promise<T>): Promise<T> {
    const conexion = await this.obtenerConexion();
    const ejecutor: EjecutorOracle = {
      ejecutar: (sql, parametros = {}) => this.correrConsulta(conexion, sql, parametros, false),
      ejecutarSp: (nombreSp, parametros) => this.correrSp(conexion, nombreSp, parametros, false),
    };
    try {
      const resultado = await trabajo(ejecutor);
      await conexion.commit();
      return resultado;
    } catch (error) {
      await this.revertir(conexion);
      throw error;
    } finally {
      await this.cerrarConexion(conexion);
    }
  }

  private async correrConsulta<T>(
    conexion: oracledb.Connection,
    sql: string,
    parametros: Record<string, unknown>,
    autoCommit: boolean,
  ): Promise<T[]> {
    try {
      const resultado = await conexion.execute<T>(sql, parametros as oracledb.BindParameters, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit,
      });
      return (resultado.rows ?? []) as T[];
    } catch (error) {
      this.logger.error('Error ejecutando SQL en Oracle', error, {
        sql,
        parametros: this.sanitizarParametros(parametros),
      });
      const tablaNueva = sql.match(/\bdwh_suka\.(dim_ci_carnet_estatus|dim_ci_carnet_excepciones)\b/i)?.[1];
      const esJtrac = /\bdwh_suka\.(dim_ci_jtrac_pdi|seq_ci_jtrac_pdi|vw_base_fabrica_v2)\b/i.test(
        sql,
      );
      const numeroError = (error as { errorNum?: number }).errorNum;
      if (esJtrac && [942, 1031, 2289, 904].includes(numeroError ?? 0)) {
        throw new ExcepcionNegocio(
          CodigosError.JTRAC_NO_DISPONIBLE,
          'JTRAC–PDI no está disponible: revise la tabla DIM_CI_JTRAC_PDI, su estructura, la secuencia SEQ_CI_JTRAC_PDI y los permisos de CI_PANEL. La vista de folios y las excepciones requieren SELECT.',
          503,
        );
      }
      if (esJtrac && numeroError === 1) {
        const esParejaDuplicada = (error as Error).message?.toUpperCase().includes('UQ_CI_JTRAC_PDI');
        throw new ExcepcionNegocio(
          CodigosError.RELACION_JTRAC_DUPLICADA,
          esParejaDuplicada
            ? 'Este PDI ya está relacionado con ese folio JTRAC.'
            : 'Hay un ID de relación duplicado. El DBA debe revisar la secuencia SEQ_CI_JTRAC_PDI.',
          409,
        );
      }
      if (esJtrac && numeroError === 2291) {
        throw new ExcepcionNegocio(
          CodigosError.VALIDACION,
          'El PDI indicado ya no existe en el catálogo. Selecciona otro informe.',
          400,
        );
      }
      if ((error as { errorNum?: number }).errorNum === 1031 && tablaNueva) {
        throw new ExcepcionNegocio(
          CodigosError.ORACLE_ERROR,
          `La cuenta de conexión a Oracle necesita permisos SELECT, INSERT, UPDATE y DELETE sobre DWH_SUKA.${tablaNueva.toUpperCase()}. Solicite su aplicación al DBA.`,
          503,
        );
      }
      throw new ExcepcionNegocio(
        CodigosError.ORACLE_ERROR,
        'Error al ejecutar consulta en Oracle.',
        500,
      );
    }
  }

  private async correrSp(
    conexion: oracledb.Connection,
    nombreSp: string,
    parametros: ParametroSpInterface[],
    autoCommit: boolean,
  ): Promise<void> {
    try {
      const binds = this.construirBindsSp(parametros);
      const placeholders = parametros.map((p) => `:${p.nombre}`).join(', ');
      const sql = `BEGIN ${nombreSp}(${placeholders}); END;`;
      await conexion.execute(sql, binds, { autoCommit });
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
    }
  }

  private async revertir(conexion: oracledb.Connection): Promise<void> {
    try {
      await conexion.rollback();
    } catch (error) {
      this.logger.advertencia('No fue posible revertir la transacción Oracle', {
        error: (error as Error).message,
      });
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
