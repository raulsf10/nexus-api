import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RevisarSolicitudCarnetDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'IDs de las filas aprobadas. Un arreglo vacío rechaza la versión.',
  })
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  filasAprobadas!: number[];

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Obligatorio cuando se rechaza la versión completa.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
