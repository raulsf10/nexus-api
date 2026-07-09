import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OperacionCarga } from '../enums/operacion-carga.enum';

export class ValidarArchivoDto {
  @ApiProperty({ enum: OperacionCarga, description: 'Tipo de operación a validar.' })
  @IsEnum(OperacionCarga)
  operacion!: OperacionCarga;
}
