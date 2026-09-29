import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ConsultarRelacionesJtracDto {
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

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}

export class ConsultarReporteJtracDto extends ConsultarRelacionesJtracDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idPosicion?: number;
}

export class ConsultarFolioJtracDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    typeof obj.folioJtrac === 'string' ? obj.folioJtrac.trim().toUpperCase() : obj.folioJtrac,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  folioJtrac!: string;
}

export class GuardarRelacionJtracDto extends ConsultarFolioJtracDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idInforme!: number;
}

export class BuscarFoliosJtracDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  busqueda!: string;
}
