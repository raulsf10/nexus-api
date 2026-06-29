import { Injectable } from '@nestjs/common';
import { OracleService } from '../../base-datos/oracle/oracle.service';
import { LoggerService } from '../../comun/logger/logger.service';

interface FilaModulo {
  MODULO: string;
}

@Injectable()
export class AutenticacionRepository {
  constructor(
    private readonly oracle: OracleService,
    private readonly logger: LoggerService,
  ) {}

  async obtenerModulosPorUsuario(usuario: string): Promise<string[]> {
    const sql = `
      SELECT modulo
      FROM   dwh_suka.dim_ci_admin
      WHERE  LOWER(usuario) = LOWER(:usuario)
    `;
    const filas = await this.oracle.ejecutar<FilaModulo>(sql, { usuario });
    return filas.map((f) => f.MODULO);
  }

  async actualizarUltimoAcceso(usuario: string): Promise<void> {
    const sql = `
      UPDATE dwh_suka.dim_ci_admin
      SET    ultimo_acceso = SYSDATE
      WHERE  LOWER(usuario) = LOWER(:usuario)
    `;
    try {
      await this.oracle.ejecutar(sql, { usuario });
    } catch (error) {
      this.logger.advertencia('No fue posible actualizar ultimo_acceso de dim_ci_admin', {
        usuario,
        error: (error as Error).message,
      });
    }
  }
}
