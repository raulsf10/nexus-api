import { Module } from '@nestjs/common';
import { InformesController } from './informes.controller';
import { InformesRepository } from './informes.repository';
import { InformesService } from './informes.service';

@Module({
  controllers: [InformesController],
  providers: [InformesService, InformesRepository],
  exports: [InformesService, InformesRepository],
})
export class InformesModule {}
