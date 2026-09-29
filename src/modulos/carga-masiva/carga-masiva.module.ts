import { Module } from '@nestjs/common';
import { CarnetModule } from '../carnet/carnet.module';
import { HistorialCarnetModule } from '../historial-carnet/historial-carnet.module';
import { InformesModule } from '../informes/informes.module';
import { NotificacionesCarnetModule } from '../notificaciones-carnet/notificaciones-carnet.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CargaMasivaController } from './carga-masiva.controller';
import { CargaMasivaService } from './carga-masiva.service';
import { LectorExcelService } from './lector-excel.service';

@Module({
  imports: [
    UsuariosModule,
    InformesModule,
    CarnetModule,
    HistorialCarnetModule,
    NotificacionesCarnetModule,
  ],
  controllers: [CargaMasivaController],
  providers: [CargaMasivaService, LectorExcelService],
  exports: [CargaMasivaService],
})
export class CargaMasivaModule {}
