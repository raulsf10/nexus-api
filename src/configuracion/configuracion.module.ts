import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfiguracionService } from './configuracion.service';
import { esquemaValidacionEnv } from './esquema-validacion';

const ambiente = process.env.APP_AMBIENTE ?? 'desarrollo';
const archivosEnv =
  ambiente === 'produccion'
    ? ['.env.production', '.env.produccion']
    : [`.env.${ambiente}`, '.env.development'];

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: archivosEnv,
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
