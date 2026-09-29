import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const numeroOpcional = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return Number(value);
};

export class GuardarExcepcionCarnetDto {
  @ApiPropertyOptional({
    description: 'Posición a ocultar. Si se omite, el informe se oculta para todas las posiciones.',
    nullable: true,
  })
  @IsOptional()
  @Transform(numeroOpcional)
  @IsInt()
  @Min(1)
  idPosicion?: number;

  @ApiProperty({ description: 'Identificador del informe que no se mostrará.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idInforme!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const comentario = value.trim();
    return comentario || undefined;
  })
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
