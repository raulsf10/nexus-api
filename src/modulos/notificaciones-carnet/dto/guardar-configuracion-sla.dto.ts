import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEmail, IsInt, Max, Min } from 'class-validator';

export class GuardarConfiguracionSlaDto {
  @ApiProperty({ minimum: 1, maximum: 525600, example: 1440 })
  @IsInt()
  @Min(1)
  @Max(525600)
  slaMinutos!: number;

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
}
