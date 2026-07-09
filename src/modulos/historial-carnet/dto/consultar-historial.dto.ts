import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { AccionHistorial } from '../enums/accion-historial.enum';
import { OrigenHistorial } from '../enums/origen-historial.enum';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ConsultarHistorialDto {
  @ApiPropertyOptional({ description: 'Usuario que realizó la acción (coincidencia parcial).' })
  @IsOptional()
  @IsString()
  usuario?: string;

  @ApiPropertyOptional({ enum: AccionHistorial, description: 'Tipo de acción.' })
  @IsOptional()
  @IsEnum(AccionHistorial)
  accion?: AccionHistorial;

  @ApiPropertyOptional({
    enum: OrigenHistorial,
    description: 'Origen del cambio (MANUAL / CARGA_MASIVA).',
  })
  @IsOptional()
  @IsEnum(OrigenHistorial)
  origen?: OrigenHistorial;

  @ApiPropertyOptional({ description: 'ID del informe (fk_veo).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  informe?: number;

  @ApiPropertyOptional({ description: 'ID de posición (fk_posicion / sk_empleado).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  posicion?: number;

  @ApiPropertyOptional({ description: 'Fecha inicial inclusive (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaDesde debe tener formato YYYY-MM-DD.' })
  fechaDesde?: string;

  @ApiPropertyOptional({ description: 'Fecha final inclusive (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'fechaHasta debe tener formato YYYY-MM-DD.' })
  fechaHasta?: string;

  @ApiPropertyOptional({ description: 'Página (desde 1).', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({ description: 'Tamaño de página (máx. 200).', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  tamanioPagina?: number;
}
