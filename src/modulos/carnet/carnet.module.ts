import { Module } from '@nestjs/common';
import { HistorialCarnetModule } from '../historial-carnet/historial-carnet.module';
import { NotificacionesCarnetModule } from '../notificaciones-carnet/notificaciones-carnet.module';
import { ExcepcionesCarnetModule } from '../excepciones-carnet/excepciones-carnet.module';
import { CarnetConsultaController } from './carnet-consulta.controller';
import { CarnetConsultaRepositoryOracle } from './carnet-consulta.repository.oracle';
import { CarnetConsultaService } from './carnet-consulta.service';
import { CarnetController } from './carnet.controller';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';
import { CarnetService } from './carnet.service';

@Module({
  imports: [HistorialCarnetModule, ExcepcionesCarnetModule, NotificacionesCarnetModule],
  controllers: [CarnetController, CarnetConsultaController],
  providers: [
    CarnetService,
    CarnetRepositoryOracle,
    CarnetRepositorySqlServer,
    CarnetConsultaService,
    CarnetConsultaRepositoryOracle,
  ],
  exports: [CarnetService, CarnetRepositoryOracle, CarnetRepositorySqlServer],
})
export class CarnetModule {}
