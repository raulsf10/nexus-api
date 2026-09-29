import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EstatusInstalacion } from '../enums/estatus-instalacion.enum';

export class InformeAgregarLoteCarnetDto {
  @ApiProperty({ description: 'fk_veo del informe a asignar.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;

  @ApiPropertyOptional({ description: 'Frecuencia de uso inicial.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  frecuencia?: string | null;

  @ApiPropertyOptional({
    enum: EstatusInstalacion,
    nullable: true,
    description: 'Estatus inicial de instalación. Si se omite, queda vacío.',
  })
  @IsOptional()
  @IsEnum(EstatusInstalacion)
  estatusInstalacion?: EstatusInstalacion | null;
}

export class AgregarLoteCarnetDto {
  @ApiProperty({ description: 'sk_empleado (posición destino).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ type: [InformeAgregarLoteCarnetDto], description: 'Informes a asignar.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique((informe: InformeAgregarLoteCarnetDto) => informe.fkVeo)
  @ValidateNested({ each: true })
  @Type(() => InformeAgregarLoteCarnetDto)
  informes!: InformeAgregarLoteCarnetDto[];
}
