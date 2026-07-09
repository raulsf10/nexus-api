import { Module } from '@nestjs/common';
import { InformesModule } from '../informes/informes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { HistorialCarnetController } from './historial-carnet.controller';
import { HistorialCarnetRepository } from './historial-carnet.repository';
import { HistorialCarnetService } from './historial-carnet.service';

@Module({
  imports: [UsuariosModule, InformesModule],
  controllers: [HistorialCarnetController],
  providers: [HistorialCarnetService, HistorialCarnetRepository],
  exports: [HistorialCarnetService],
})
export class HistorialCarnetModule {}
