import { Global, Module } from '@nestjs/common';
import { LoggerModule as LoggerModulePino } from 'nestjs-pino';
import { ConfiguracionModule } from '../../configuracion/configuracion.module';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { LoggerService } from './logger.service';
import { construirConfigPino } from './pino.config';

@Global()
@Module({
  imports: [
    LoggerModulePino.forRootAsync({
      imports: [ConfiguracionModule],
      inject: [ConfiguracionService],
      useFactory: (configuracion: ConfiguracionService) => construirConfigPino(configuracion),
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService, LoggerModulePino],
})
export class LoggerModule {}
