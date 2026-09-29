import * as Joi from 'joi';
import { separarLista } from './listas-configuracion';

export const esquemaValidacionEnv = Joi.object({
  APP_PUERTO: Joi.number().port().default(3000),
  APP_AMBIENTE: Joi.string().valid('desarrollo', 'pruebas', 'produccion').required(),
  APP_NOMBRE: Joi.string().required(),
  APP_PREFIJO_API: Joi.string().default('api'),
  CARGA_MASIVA_MAX_FILAS: Joi.number().integer().min(1).max(2000).default(2000),

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
  AD_URL: Joi.string()
    .uri({ scheme: ['ldap', 'ldaps'] })
    .required(),
  AD_BASE_DN: Joi.string().required(),

  LOG_DIRECTORIO: Joi.string().required(),
  LOG_NIVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  LOG_RETENCION_DIAS: Joi.number().integer().min(1).default(30),

  // SMTP. Si SMTP_HOST está vacío, las notificaciones se desactivan sin
  // impedir que NEXUS inicie o que se apliquen cambios de CARNET.
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USUARIO: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_REMITENTE: Joi.string().allow('').default(''),
  ALERTA_DESTINATARIOS_DEFAULT: Joi.string().allow('').default('raul.fragoso@linusanalitica.mx'),
  NOTIFICACIONES_DESTINATARIO_FORZADO: Joi.string()
    .trim()
    .email({ tlds: { allow: false } })
    .allow('')
    .default(''),
  CARNET_USAR_CORREO_POSICION: Joi.boolean().default(false),
  CARNET_AVISOS_ESCALONADOS_ACTIVOS: Joi.boolean().default(false),
  CARNET_SLA_MINUTOS: Joi.number().integer().min(1).max(525600),
  // Compatibilidad con instalaciones que todavía no han cambiado su .env.
  CARNET_SLA_HORAS: Joi.number().integer().min(1).max(8760),
  CARNET_SLA_DESTINATARIOS: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .default('')
    .custom((valor: string, ayudas) => {
      const correos = separarLista(valor);
      const correo = Joi.string().email({ tlds: { allow: false } });
      return correos.length && correos.every((elemento) => !correo.validate(elemento).error)
        ? valor
        : ayudas.error('any.invalid');
    })
    .when('CARNET_AVISOS_ESCALONADOS_ACTIVOS', {
      is: true,
      then: Joi.string().invalid('').required(),
    }),
  CARNET_SLA_INFORMES: Joi.string()
    .trim()
    .max(20000)
    .allow('')
    .default('')
    .custom((valor: string, ayudas) => {
      const informes = separarLista(valor);
      return informes.length &&
        informes.every((id) => /^\d+$/.test(id) && Number(id) > 0 && Number(id) <= 2147483647)
        ? valor
        : ayudas.error('any.invalid');
    })
    .when('CARNET_AVISOS_ESCALONADOS_ACTIVOS', {
      is: true,
      then: Joi.string().invalid('').required(),
    }),
  CARNET_AVISOS_INTERVALO_SEGUNDOS: Joi.number().integer().min(10).max(3600).default(60),
  CARNET_AVISOS_ZONA_HORARIA: Joi.string()
    .custom((valor: string, ayudas) => {
      try {
        new Intl.DateTimeFormat('es-MX', { timeZone: valor }).format();
        return valor;
      } catch {
        return ayudas.error('any.invalid');
      }
    })
    .default('America/Mexico_City'),

  ESTATICOS_DIRECTORIO: Joi.string().default('./public'),
});
