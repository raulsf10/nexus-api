import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';

@Injectable()
export class ExcepcionesCarnetEsquemaService {
  private disponible = false;

  constructor(private readonly oracle: OracleService) {}

  async estaDisponible(): Promise<boolean> {
    if (this.disponible) {
      return true;
    }
    const filas = await this.oracle.ejecutar<{ TOTAL?: unknown }>(`
      SELECT COUNT(*) AS total
      FROM all_tables
      WHERE owner = 'DWH_SUKA'
        AND table_name = 'DIM_CI_CARNET_EXCEPCIONES'
    `);
    this.disponible = Number(filas[0]?.['TOTAL'] ?? 0) > 0;
    return this.disponible;
  }
}
