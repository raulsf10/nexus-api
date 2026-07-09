export interface ConfiguracionAppSeccion {
  puerto: number;
  ambiente: 'desarrollo' | 'pruebas' | 'produccion';
  nombre: string;
  prefijoApi: string;
  estaticosDirectorio: string;
  cargaMasivaMaxFilas: number;
}

export interface ConfiguracionOracleSeccion {
  host: string;
  puerto: number;
  servicio: string;
  usuario: string;
  contrasena: string;
  esquema: string;
  poolMin: number;
  poolMax: number;
  libDir: string;
}

export interface ConfiguracionSqlServerSeccion {
  host: string;
  puerto: number;
  baseDatos: string;
  usuario: string;
  contrasena: string;
  poolMin: number;
  poolMax: number;
}

export interface ConfiguracionJwtSeccion {
  secreto: string;
  expiraEn: string;
}

export interface ConfiguracionAdSeccion {
  dominio: string;
  url: string;
  baseDn: string;
}

export interface ConfiguracionLogSeccion {
  directorio: string;
  nivel: string;
  retencionDias: number;
}

export interface ConfiguracionAppInterface {
  app: ConfiguracionAppSeccion;
  oracle: ConfiguracionOracleSeccion;
  sqlServer: ConfiguracionSqlServerSeccion;
  jwt: ConfiguracionJwtSeccion;
  ad: ConfiguracionAdSeccion;
  log: ConfiguracionLogSeccion;
}
