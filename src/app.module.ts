import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { ConfiguracionService } from './configuracion/configuracion.service';
import { LoggerModule } from './comun/logger/logger.module';
import { ComunModule } from './comun/comun.module';
import { BaseDatosModule } from './base-datos/base-datos.module';
import { AutenticacionModule } from './modulos/autenticacion/autenticacion.module';
import { JwtGuard } from './modulos/autenticacion/guardias/jwt.guard';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { InformesModule } from './modulos/informes/informes.module';
import { CarnetModule } from './modulos/carnet/carnet.module';
import { CargaMasivaModule } from './modulos/carga-masiva/carga-masiva.module';
import { HistorialCarnetModule } from './modulos/historial-carnet/historial-carnet.module';

@Module({
  imports: [
    ConfiguracionModule,
    LoggerModule,
    ComunModule,
    BaseDatosModule,
    ServeStaticModule.forRootAsync({
      imports: [ConfiguracionModule],
      inject: [ConfiguracionService],
      useFactory: (configuracion: ConfiguracionService) => {
        const cfg = configuracion.obtenerApp();
        const prefijo = cfg.prefijoApi.startsWith('/') ? cfg.prefijoApi : `/${cfg.prefijoApi}`;
        return [
          {
            rootPath: join(process.cwd(), cfg.estaticosDirectorio),
            serveRoot: '/',
            exclude: [`${prefijo}/(.*)`],
            serveStaticOptions: { fallthrough: true, index: 'index.html' },
          },
        ];
      },
    }),
    AutenticacionModule,
    UsuariosModule,
    InformesModule,
    CarnetModule,
    CargaMasivaModule,
    HistorialCarnetModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
})
export class AppModule {}
