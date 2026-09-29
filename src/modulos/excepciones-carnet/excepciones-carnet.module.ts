import { Module } from '@nestjs/common';
import { ExcepcionesCarnetController } from './excepciones-carnet.controller';
import { ExcepcionesCarnetEsquemaService } from './excepciones-carnet-esquema.service';
import { ExcepcionesCarnetRepository } from './excepciones-carnet.repository';
import { ExcepcionesCarnetService } from './excepciones-carnet.service';

@Module({
  controllers: [ExcepcionesCarnetController],
  providers: [
    ExcepcionesCarnetService,
    ExcepcionesCarnetRepository,
    ExcepcionesCarnetEsquemaService,
  ],
  exports: [ExcepcionesCarnetService, ExcepcionesCarnetEsquemaService],
})
export class ExcepcionesCarnetModule {}
