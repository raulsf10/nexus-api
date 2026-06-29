import { Global, Module } from '@nestjs/common';
import { OracleModule } from './oracle/oracle.module';
import { SqlServerModule } from './sql-server/sql-server.module';

@Global()
@Module({
  imports: [OracleModule, SqlServerModule],
  exports: [OracleModule, SqlServerModule],
})
export class BaseDatosModule {}
