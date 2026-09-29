import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OperacionCarga } from '../../carga-masiva/enums/operacion-carga.enum';

export class CrearSolicitudCarnetDto {
  @ApiPropertyOptional({ enum: OperacionCarga, default: OperacionCarga.ASIGNACION })
  @IsOptional()
  @IsEnum(OperacionCarga)
  operacion?: OperacionCarga;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Comentario del solicitante.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
