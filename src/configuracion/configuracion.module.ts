import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfiguracionService } from './configuracion.service';
import { esquemaValidacionEnv } from './esquema-validacion';

const ambiente = process.env.APP_AMBIENTE ?? 'desarrollo';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${ambiente}`, '.env.development'],
      validationSchema: esquemaValidacionEnv,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      cache: true,
    }),
  ],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
