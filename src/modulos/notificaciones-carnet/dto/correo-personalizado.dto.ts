import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum FiltroDestinatarios {
  ASIGNADAS = 'asignadas',
  EXCLUIDAS = 'excluidas',
  INCLUIDAS = 'incluidas',
  SIN_CORREO = 'sin-correo',
  CORREOS_UNICOS = 'correos-unicos',
}

export class DestinatariosPersonalizadosDto {
  @IsEnum(FiltroDestinatarios)
  filtro: FiltroDestinatarios = FiltroDestinatarios.INCLUIDAS;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idInforme!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanioPagina = 25;
}

export class EnviarCorreoPersonalizadoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idInforme!: number;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  asunto!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  contenido!: string;

  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]+$/)
  huellaDestinatarios!: string;
}
