import { Module } from '@nestjs/common';
import { HistorialCarnetModule } from '../historial-carnet/historial-carnet.module';
import { CarnetController } from './carnet.controller';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';
import { CarnetService } from './carnet.service';

@Module({
  imports: [HistorialCarnetModule],
  controllers: [CarnetController],
  providers: [CarnetService, CarnetRepositoryOracle, CarnetRepositorySqlServer],
  exports: [CarnetService, CarnetRepositoryOracle, CarnetRepositorySqlServer],
})
export class CarnetModule {}
