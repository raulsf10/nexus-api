import { Global, Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { TodasExcepcionesFilter } from './filtros/todas-excepciones.filter';
import { LogEscrituraInterceptor } from './interceptores/log-escritura.interceptor';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [TodasExcepcionesFilter, LogEscrituraInterceptor],
  exports: [LoggerModule, TodasExcepcionesFilter, LogEscrituraInterceptor],
})
export class ComunModule {}
