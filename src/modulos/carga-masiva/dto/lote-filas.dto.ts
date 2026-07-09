import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { OperacionCarga } from '../enums/operacion-carga.enum';
import { FilaCargaDto } from './fila-carga.dto';

export class LoteFilasDto {
  @ApiProperty({ enum: OperacionCarga, description: 'Tipo de operación.' })
  @IsEnum(OperacionCarga)
  operacion!: OperacionCarga;

  @ApiProperty({ type: [FilaCargaDto], description: 'Filas a procesar.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FilaCargaDto)
  filas!: FilaCargaDto[];
}
