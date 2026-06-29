import * as Joi from 'joi';

export const esquemaValidacionEnv = Joi.object({
  APP_PUERTO: Joi.number().port().default(3000),
  APP_AMBIENTE: Joi.string().valid('desarrollo', 'pruebas', 'produccion').required(),
  APP_NOMBRE: Joi.string().required(),
  APP_PREFIJO_API: Joi.string().default('api'),

  JWT_SECRETO: Joi.string().min(16).required(),
  JWT_EXPIRA_EN: Joi.string().default('8h'),

  ORACLE_HOST: Joi.string().required(),
  ORACLE_PUERTO: Joi.number().port().required(),
  ORACLE_SERVICIO: Joi.string().required(),
  ORACLE_USUARIO: Joi.string().required(),
  ORACLE_CONTRASENA: Joi.string().allow('').required(),
  ORACLE_ESQUEMA: Joi.string().required(),
  ORACLE_POOL_MIN: Joi.number().integer().min(0).default(2),
  ORACLE_POOL_MAX: Joi.number().integer().min(1).default(10),
  ORACLE_LIB_DIR: Joi.string().allow('').default(''),

  SQLSERVER_HOST: Joi.string().required(),
  SQLSERVER_PUERTO: Joi.number().port().required(),
  SQLSERVER_BD: Joi.string().required(),
  SQLSERVER_USUARIO: Joi.string().required(),
  SQLSERVER_CONTRASENA: Joi.string().allow('').required(),
  SQLSERVER_POOL_MIN: Joi.number().integer().min(0).default(1),
  SQLSERVER_POOL_MAX: Joi.number().integer().min(1).default(5),

  AD_DOMINIO: Joi.string().required(),
  AD_URL: Joi.string().uri({ scheme: ['ldap', 'ldaps'] }).required(),
  AD_BASE_DN: Joi.string().required(),

  LOG_DIRECTORIO: Joi.string().required(),
  LOG_NIVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  LOG_RETENCION_DIAS: Joi.number().integer().min(1).default(30),

  ESTATICOS_DIRECTORIO: Joi.string().default('./public'),
});
