import { Module } from '@nestjs/common';
import { CargaIndicadoresService } from './carga-indicadores.service';
import { JtracPdiHistorialRepository } from './jtrac-pdi-historial.repository';
import { InformesModule } from '../informes/informes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ExcepcionesCarnetModule } from '../excepciones-carnet/excepciones-carnet.module';
import { JtracPdiController } from './jtrac-pdi.controller';
import { JtracPdiRepository } from './jtrac-pdi.repository';
import { JtracPdiService } from './jtrac-pdi.service';

@Module({
  imports: [InformesModule, UsuariosModule, ExcepcionesCarnetModule],
  controllers: [JtracPdiController],
  providers: [
    JtracPdiRepository,
    JtracPdiService,
    CargaIndicadoresService,
    JtracPdiHistorialRepository,
  ],
})
export class JtracPdiModule {}
