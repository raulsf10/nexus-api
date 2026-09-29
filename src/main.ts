import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfiguracionService } from './configuracion/configuracion.service';
import { LoggerService } from './comun/logger/logger.service';
import { TodasExcepcionesFilter } from './comun/filtros/todas-excepciones.filter';
import { LogEscrituraInterceptor } from './comun/interceptores/log-escritura.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useBodyParser('json', { limit: '2mb' });

  app.useLogger(app.get(Logger));

  const configuracion = app.get(ConfiguracionService);
  const cfgApp = configuracion.obtenerApp();
  const esProduccion = configuracion.esProduccion();
  const esDesarrollo = configuracion.esDesarrollo();

  if (configuracion.obtenerJwt().secreto.length < 32) {
    console.warn(
      '[NEXUS] ADVERTENCIA: JWT_SECRETO tiene menos de 32 caracteres. ' +
        'Use un secreto más largo en producción.',
    );
  }

  app.setGlobalPrefix(cfgApp.prefijoApi);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const logger = app.get(LoggerService);
  app.useGlobalFilters(new TodasExcepcionesFilter(logger));
  app.useGlobalInterceptors(new LogEscrituraInterceptor(logger));

  if (!esProduccion) {
    const config = new DocumentBuilder()
      .setTitle('NEXUS API')
      .setDescription('Backend de NEXUS - gestión de permisos de informes Sukarne')
      .setVersion(obtenerVersionPackage())
      .addBearerAuth()
      .build();
    const documento = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${cfgApp.prefijoApi}/docs`, app, documento);
  }

  if (esDesarrollo) {
    app.enableCors({
      origin: 'http://localhost:4200',
      credentials: true,
    });
  }

  app.enableShutdownHooks();

  await app.listen(cfgApp.puerto);
  logger.info(`${cfgApp.nombre} escuchando en puerto ${cfgApp.puerto}`, {
    ambiente: cfgApp.ambiente,
    prefijo: cfgApp.prefijoApi,
  });
}

function obtenerVersionPackage(): string {
  try {
    const paquete = require('../package.json') as { version?: string };
    return paquete.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

bootstrap().catch((error) => {
  console.error('Error fatal al iniciar nexus-api:', error);
  process.exit(1);
});
