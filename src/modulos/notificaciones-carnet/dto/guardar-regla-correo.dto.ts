import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';

export class GuardarReglaCorreoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idInforme!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  correoInicial?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  diasHabiles!: number;

  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.activa)
  @IsBoolean()
  activa!: boolean;
}

export class ConsultarAvisosDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagina = 1;
}
