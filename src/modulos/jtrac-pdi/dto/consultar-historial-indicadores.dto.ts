import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ConsultarRelacionesJtracDto } from './jtrac-pdi.dto';

export class ConsultarHistorialIndicadoresDto extends ConsultarRelacionesJtracDto {
  @ApiPropertyOptional({ description: 'Usuario que realizó la acción.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  usuario?: string;

  @ApiPropertyOptional({ enum: ['ASIGNAR', 'ELIMINAR', 'ACTUALIZAR'] })
  @IsOptional()
  @IsIn(['ASIGNAR', 'ELIMINAR', 'ACTUALIZAR'])
  accion?: 'ASIGNAR' | 'ELIMINAR' | 'ACTUALIZAR';

  @ApiPropertyOptional({ enum: ['Individual', 'Carga masiva'] })
  @IsOptional()
  @IsIn(['Individual', 'Carga masiva'])
  origen?: 'Individual' | 'Carga masiva';

  @ApiPropertyOptional({ description: 'ID del informe.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  informe?: number;

  @ApiPropertyOptional({ description: 'Folio JTRAC (coincidencia parcial).' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(256)
  folioJtrac?: string;

  @ApiPropertyOptional({ description: 'Fecha inicial inclusive (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({ description: 'Fecha final inclusive (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fechaHasta?: string;
}
