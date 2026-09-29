import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { CargaMasivaModule } from '../carga-masiva/carga-masiva.module';
import { SolicitudesCarnetController } from './solicitudes-carnet.controller';
import { SolicitudesCarnetRepository } from './solicitudes-carnet.repository';
import { SolicitudesCarnetService } from './solicitudes-carnet.service';

@Module({
  imports: [AutenticacionModule, CargaMasivaModule],
  controllers: [SolicitudesCarnetController],
  providers: [SolicitudesCarnetService, SolicitudesCarnetRepository],
})
export class SolicitudesCarnetModule {}
