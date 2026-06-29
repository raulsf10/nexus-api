import { Global, Module } from '@nestjs/common';
import { SqlServerService } from './sql-server.service';

@Global()
@Module({
  providers: [SqlServerService],
  exports: [SqlServerService],
})
export class SqlServerModule {}
