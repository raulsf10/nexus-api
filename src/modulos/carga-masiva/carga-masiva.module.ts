import { Module } from '@nestjs/common';
import { CarnetModule } from '../carnet/carnet.module';
import { HistorialCarnetModule } from '../historial-carnet/historial-carnet.module';
import { InformesModule } from '../informes/informes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CargaMasivaController } from './carga-masiva.controller';
import { CargaMasivaService } from './carga-masiva.service';
import { LectorExcelService } from './lector-excel.service';

@Module({
  imports: [UsuariosModule, InformesModule, CarnetModule, HistorialCarnetModule],
  controllers: [CargaMasivaController],
  providers: [CargaMasivaService, LectorExcelService],
})
export class CargaMasivaModule {}
