import { Module } from '@nestjs/common';
import { InformesModule } from '../informes/informes.module';
import { NotificacionesCarnetRepositoryOracle } from './notificaciones-carnet.repository.oracle';
import { NotificacionesCarnetService } from './notificaciones-carnet.service';
import { NotificacionesCarnetController } from './notificaciones-carnet.controller';
import { NotificacionesProgramadasRepository } from './notificaciones-programadas.repository';
import { SlaCarnetService } from './sla-carnet.service';
import { CarnetRepositoryOracle } from '../carnet/carnet.repository.oracle';
import { CarnetRepositorySqlServer } from '../carnet/carnet.repository.sql-server';
import { HistorialCarnetModule } from '../historial-carnet/historial-carnet.module';
import { CorreosPersonalizadosService } from './correos-personalizados.service';

@Module({
  imports: [InformesModule, HistorialCarnetModule],
  controllers: [NotificacionesCarnetController],
  providers: [
    CorreosPersonalizadosService,
    NotificacionesCarnetService,
    NotificacionesCarnetRepositoryOracle,
    NotificacionesProgramadasRepository,
    SlaCarnetService,
    CarnetRepositoryOracle,
    CarnetRepositorySqlServer,
  ],
  exports: [NotificacionesCarnetService, SlaCarnetService],
})
export class NotificacionesCarnetModule {}
