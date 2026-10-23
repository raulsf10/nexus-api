import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GuardarSlaInformeDto {
  @ApiProperty({ minimum: 1, maximum: 525600, example: 1440 })
  @IsInt()
  @Min(1)
  @Max(525600)
  slaMinutos!: number;

  @ApiProperty()
  @IsBoolean()
  activa!: boolean;

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description:
      'Texto debajo de la tabla del aviso final SLA de este informe. Vacío conserva el mensaje predeterminado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  mensajeUsuario?: string | null;
}
