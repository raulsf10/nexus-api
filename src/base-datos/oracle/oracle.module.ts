import { Global, Module } from '@nestjs/common';
import { OracleService } from './oracle.service';

@Global()
@Module({
  providers: [OracleService],
  exports: [OracleService],
})
export class OracleModule {}
