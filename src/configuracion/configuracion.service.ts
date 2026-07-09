import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConfiguracionAdSeccion,
  ConfiguracionAppSeccion,
  ConfiguracionJwtSeccion,
  ConfiguracionLogSeccion,
  ConfiguracionOracleSeccion,
  ConfiguracionSqlServerSeccion,
} from './interfaces/configuracion-app.interface';

@Injectable()
export class ConfiguracionService {
  constructor(private readonly configService: ConfigService) {}

  obtenerApp(): ConfiguracionAppSeccion {
    return {
      puerto: this.leerNumero('APP_PUERTO'),
      ambiente: this.leerTexto('APP_AMBIENTE') as ConfiguracionAppSeccion['ambiente'],
      nombre: this.leerTexto('APP_NOMBRE'),
      prefijoApi: this.leerTexto('APP_PREFIJO_API'),
      estaticosDirectorio: this.leerTexto('ESTATICOS_DIRECTORIO'),
      cargaMasivaMaxFilas: this.leerNumero('CARGA_MASIVA_MAX_FILAS'),
    };
  }

  obtenerOracle(): ConfiguracionOracleSeccion {
    return {
      host: this.leerTexto('ORACLE_HOST'),
      puerto: this.leerNumero('ORACLE_PUERTO'),
      servicio: this.leerTexto('ORACLE_SERVICIO'),
      usuario: this.leerTexto('ORACLE_USUARIO'),
      contrasena: this.leerTexto('ORACLE_CONTRASENA'),
      esquema: this.leerTexto('ORACLE_ESQUEMA'),
      poolMin: this.leerNumero('ORACLE_POOL_MIN'),
      poolMax: this.leerNumero('ORACLE_POOL_MAX'),
      libDir: this.configService.get<string>('ORACLE_LIB_DIR') ?? '',
    };
  }

  obtenerSqlServer(): ConfiguracionSqlServerSeccion {
    return {
      host: this.leerTexto('SQLSERVER_HOST'),
      puerto: this.leerNumero('SQLSERVER_PUERTO'),
      baseDatos: this.leerTexto('SQLSERVER_BD'),
      usuario: this.leerTexto('SQLSERVER_USUARIO'),
      contrasena: this.leerTexto('SQLSERVER_CONTRASENA'),
      poolMin: this.leerNumero('SQLSERVER_POOL_MIN'),
      poolMax: this.leerNumero('SQLSERVER_POOL_MAX'),
    };
  }

  obtenerJwt(): ConfiguracionJwtSeccion {
    return {
      secreto: this.leerTexto('JWT_SECRETO'),
      expiraEn: this.leerTexto('JWT_EXPIRA_EN'),
    };
  }

  obtenerAd(): ConfiguracionAdSeccion {
    return {
      dominio: this.leerTexto('AD_DOMINIO'),
      url: this.leerTexto('AD_URL'),
      baseDn: this.leerTexto('AD_BASE_DN'),
    };
  }

  obtenerLog(): ConfiguracionLogSeccion {
    return {
      directorio: this.leerTexto('LOG_DIRECTORIO'),
      nivel: this.leerTexto('LOG_NIVEL'),
      retencionDias: this.leerNumero('LOG_RETENCION_DIAS'),
    };
  }

  esProduccion(): boolean {
    return this.obtenerApp().ambiente === 'produccion';
  }

  esDesarrollo(): boolean {
    return this.obtenerApp().ambiente === 'desarrollo';
  }

  private leerTexto(clave: string): string {
    const valor = this.configService.get<string>(clave);
    if (valor === undefined || valor === null) {
      throw new Error(`Variable de entorno faltante: ${clave}`);
    }
    return valor;
  }

  private leerNumero(clave: string): number {
    const valor = this.configService.get<number>(clave);
    if (valor === undefined || valor === null) {
      throw new Error(`Variable de entorno faltante: ${clave}`);
    }
    return Number(valor);
  }
}
