import { Module } from '@nestjs/common';
import { CarnetController } from './carnet.controller';
import { CarnetRepositoryOracle } from './carnet.repository.oracle';
import { CarnetRepositorySqlServer } from './carnet.repository.sql-server';
import { CarnetService } from './carnet.service';

@Module({
  controllers: [CarnetController],
  providers: [CarnetService, CarnetRepositoryOracle, CarnetRepositorySqlServer],
})
export class CarnetModule {}
