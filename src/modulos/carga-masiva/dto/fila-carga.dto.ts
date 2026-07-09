import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsInt, IsOptional } from 'class-validator';

// Los campos idPosicion/idInforme/frecuencia se aceptan sin tipar (@Allow) porque
// revalidar re-corre la validación sobre valores que el usuario puede haber dejado
// mal (texto donde va número, etc.); la anotación fila por fila la hace el servicio.
//
// estado/errores/nombrePosicion/nombreInforme se declaran solo para pasar el
// whitelist del ValidationPipe: el front reenvía la fila completa que devolvió
// /validar, pero el servicio los recalcula e ignora los valores entrantes.
export class FilaCargaDto {
  @ApiPropertyOptional({
    description: 'Número de fila original en el Excel; se conserva en revalidar.',
  })
  @IsOptional()
  @IsInt()
  fila?: number;

  @ApiPropertyOptional({ description: 'ID de posición (sk_empleado).' })
  @Allow()
  idPosicion?: unknown;

  @ApiPropertyOptional({ description: 'ID de informe (sk_veo).' })
  @Allow()
  idInforme?: unknown;

  @ApiPropertyOptional({ description: 'Frecuencia de uso; solo aplica a asignación.' })
  @Allow()
  frecuencia?: unknown;

  @Allow()
  estado?: unknown;

  @Allow()
  errores?: unknown;

  @Allow()
  nombrePosicion?: unknown;

  @Allow()
  nombreInforme?: unknown;
}
