import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfiguracionModule } from '../../configuracion/configuracion.module';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { AutenticacionController } from './autenticacion.controller';
import { AutenticacionRepository } from './autenticacion.repository';
import { AutenticacionService } from './autenticacion.service';
import { JwtEstrategia } from './estrategias/jwt.estrategia';
import { JwtGuard } from './guardias/jwt.guard';
import { RequiereModuloGuard } from './guardias/requiere-modulo.guard';
import { LdapService } from './ldap.service';

@Module({
  imports: [
    ConfiguracionModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfiguracionModule],
      inject: [ConfiguracionService],
      useFactory: (configuracion: ConfiguracionService) => {
        const jwt = configuracion.obtenerJwt();
        return {
          secret: jwt.secreto,
          signOptions: {
            expiresIn: jwt.expiraEn,
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  controllers: [AutenticacionController],
  providers: [
    AutenticacionService,
    AutenticacionRepository,
    LdapService,
    JwtEstrategia,
    JwtGuard,
    RequiereModuloGuard,
  ],
  exports: [JwtModule, JwtGuard, RequiereModuloGuard],
})
export class AutenticacionModule {}
