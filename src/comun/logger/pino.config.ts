import { Params } from 'nestjs-pino';
import { ConfiguracionService } from '../../configuracion/configuracion.service';

export function construirConfigPino(configuracion: ConfiguracionService): Params {
  const log = configuracion.obtenerLog();
  const esProduccion = configuracion.esProduccion();

  const baseDirectorio = log.directorio;
  const niveles = {
    level: log.nivel,
    autoLogging: false,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.contrasena',
        '*.password',
        '*.contraseña',
      ],
      remove: true,
    },
  };

  if (esProduccion) {
    return {
      pinoHttp: {
        ...niveles,
        transport: {
          target: 'pino-roll',
          options: {
            file: `${baseDirectorio}/app`,
            frequency: 'daily',
            mkdir: true,
            extension: '.log',
            dateFormat: 'yyyy-MM-dd',
            limit: { count: log.retencionDias },
          },
        },
      },
    };
  }

  return {
    pinoHttp: {
      ...niveles,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    },
  };
}
