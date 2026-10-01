import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FRECUENCIAS_VALIDAS } from '../../carga-masiva/carga-masiva.constantes';
import {
  EstatusInstalacion,
  normalizarEstatusInstalacion,
} from '../../carnet/enums/estatus-instalacion.enum';

export class AjusteFilaSolicitudDto {
  @IsInt()
  @Min(1)
  idFila!: number;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsIn(FRECUENCIAS_VALIDAS)
  frecuencia?: string;

  @ValidateIf((_objeto, valor) => valor !== undefined)
  @Transform(({ value }) => normalizarEstatusInstalacion(value) ?? value)
  @IsIn(Object.values(EstatusInstalacion))
  estatusInstalacion?: EstatusInstalacion;
}

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ArrayUnique((fila: AjusteFilaSolicitudDto) => fila.idFila)
  @ValidateNested({ each: true })
  @Type(() => AjusteFilaSolicitudDto)
  ajustes?: AjusteFilaSolicitudDto[];

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
