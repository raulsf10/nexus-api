import { Global, Module } from '@nestjs/common';
import { CarnetEstatusInstalacionEsquemaService } from './carnet-estatus-instalacion-esquema.service';
import { OracleService } from './oracle.service';

@Global()
@Module({
  providers: [OracleService, CarnetEstatusInstalacionEsquemaService],
  exports: [OracleService, CarnetEstatusInstalacionEsquemaService],
})
export class OracleModule {}
