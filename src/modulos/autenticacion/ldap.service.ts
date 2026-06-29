import { Injectable } from '@nestjs/common';
import { createClient } from 'ldapjs';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';

type ErrorLdap = Error & { code?: number; name?: string };

const TIMEOUT_LDAP_MS = 5000;

@Injectable()
export class LdapService {
  constructor(private readonly configuracion: ConfiguracionService) {}

  async autenticar(usuario: string, contrasena: string): Promise<void> {
    const cfg = this.configuracion.obtenerAd();
    const bindDN = `${usuario}@${cfg.dominio}`;
    const cliente = createClient({
      url: cfg.url,
      timeout: TIMEOUT_LDAP_MS,
      connectTimeout: TIMEOUT_LDAP_MS,
      reconnect: false,
    });

    // Evita que un evento error tumbe el proceso; el resultado real viene en el callback de bind.
    cliente.on('error', () => {});

    try {
      await new Promise<void>((resolve, reject) => {
        cliente.bind(bindDN, contrasena, (err) => {
          if (err) reject(this.mapearError(err as ErrorLdap));
          else resolve();
        });
      });
    } finally {
      try {
        cliente.unbind();
      } catch {
        // unbind best-effort
      }
    }
  }

  private mapearError(err: ErrorLdap): ExcepcionNegocio {
    const esCredencialesInvalidas = err.name === 'InvalidCredentialsError' || err.code === 49;
    if (esCredencialesInvalidas) {
      return new ExcepcionNegocio(
        CodigosError.CONTRASENA_INVALIDA,
        'Usuario o contraseña incorrectos.',
        401,
      );
    }
    return new ExcepcionNegocio(
      CodigosError.AD_NO_DISPONIBLE,
      'Servicio de autenticación no disponible. Intente más tarde.',
      503,
      { detalle: err.message },
    );
  }
}
