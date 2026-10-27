import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GuardarConfiguracionSlaDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 525600,
    example: 1440,
    deprecated: true,
    description: 'Campo anterior ignorado. El plazo se configura exclusivamente por informe.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  slaMinutos?: number;

  @ApiProperty({ type: [String], example: ['responsable@empresa.com'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((correo: unknown) =>
          typeof correo === 'string' ? correo.trim().toLowerCase() : correo,
        )
      : value,
  )
  @IsEmail({}, { each: true, message: 'Captura correos válidos separados por coma.' })
  destinatariosIniciales!: string[];

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description:
      'Texto debajo de la tabla del aviso inicial SLA. Vacío conserva el mensaje predeterminado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  mensajeInicial?: string | null;
}
