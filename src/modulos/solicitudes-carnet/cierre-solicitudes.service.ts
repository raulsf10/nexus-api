import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../comun/logger/logger.service';
import { SolicitudesCarnetRepository } from './solicitudes-carnet.repository';

@Injectable()
export class CierreSolicitudesService implements OnModuleInit, OnModuleDestroy {
  private intervalo?: NodeJS.Timeout;
  private ocupado = false;

  constructor(
    private readonly configuracion: ConfigService,
    private readonly repositorio: SolicitudesCarnetRepository,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    if (!this.configuracion.get<boolean>('SOLICITUDES_CIERRE_AUTOMATICO_ACTIVO')) return;
    this.intervalo = setInterval(() => void this.procesar(), 60000);
    this.intervalo.unref();
  }

  onModuleDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  async procesar(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      await this.repositorio.cerrarParcialesVencidas();
    } catch {
      this.logger.advertencia('No se pudo completar el cierre de solicitudes.');
    } finally {
      this.ocupado = false;
    }
  }
}
