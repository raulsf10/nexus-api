import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectionPool, IResult } from 'mssql';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';

@Injectable()
export class SqlServerService implements OnModuleInit, OnModuleDestroy {
  private pool?: ConnectionPool;

  constructor(
    private readonly configuracion: ConfiguracionService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.configuracion.obtenerSqlServer();
    try {
      this.pool = new ConnectionPool({
        server: cfg.host,
        port: cfg.puerto,
        database: cfg.baseDatos,
        user: cfg.usuario,
        password: cfg.contrasena,
        pool: { min: cfg.poolMin, max: cfg.poolMax },
        options: {
          encrypt: true,
          trustServerCertificate: true,
        },
      });
      await this.pool.connect();
      this.logger.info('Pool SQL Server inicializado', {
        host: cfg.host,
        baseDatos: cfg.baseDatos,
        poolMin: cfg.poolMin,
        poolMax: cfg.poolMax,
      });
    } catch (error) {
      this.logger.advertencia('No fue posible conectar a SQL Server al iniciar', {
        host: cfg.host,
        baseDatos: cfg.baseDatos,
        error: (error as Error).message,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.close();
      this.logger.info('Pool SQL Server cerrado');
    } catch (error) {
      this.logger.advertencia('Error al cerrar el pool de SQL Server', {
        error: (error as Error).message,
      });
    }
  }

  async ejecutar<T = Record<string, unknown>>(
    sql: string,
    parametros: Record<string, unknown> = {},
  ): Promise<T[]> {
    if (!this.pool || !this.pool.connected) {
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'El pool de SQL Server no está disponible.',
        503,
      );
    }
    try {
      const peticion = this.pool.request();
      for (const [nombre, valor] of Object.entries(parametros)) {
        peticion.input(nombre, valor);
      }
      const resultado = (await peticion.query<T>(sql)) as IResult<T>;
      return resultado.recordset as T[];
    } catch (error) {
      this.logger.advertencia('Error ejecutando SQL en SQL Server', {
        sql,
        parametros: this.sanitizarParametros(parametros),
        error: (error as Error).message,
      });
      throw new ExcepcionNegocio(
        CodigosError.SQL_SERVER_ERROR,
        'Error al ejecutar consulta en SQL Server.',
        500,
      );
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
