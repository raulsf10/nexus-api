import { Module } from '@nestjs/common';
import { CierreSolicitudesService } from './cierre-solicitudes.service';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { CargaMasivaModule } from '../carga-masiva/carga-masiva.module';
import { SolicitudesCarnetController } from './solicitudes-carnet.controller';
import { SolicitudesCarnetRepository } from './solicitudes-carnet.repository';
import { SolicitudesCarnetService } from './solicitudes-carnet.service';
import { NotificacionesCarnetModule } from '../notificaciones-carnet/notificaciones-carnet.module';
import { NotificacionesSolicitudesService } from './notificaciones-solicitudes.service';

@Module({
  imports: [AutenticacionModule, CargaMasivaModule, NotificacionesCarnetModule],
  controllers: [SolicitudesCarnetController],
  providers: [
    SolicitudesCarnetService,
    SolicitudesCarnetRepository,
    CierreSolicitudesService,
    NotificacionesSolicitudesService,
  ],
})
export class SolicitudesCarnetModule {}
