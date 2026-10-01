import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { FilaCargaDto } from '../../carga-masiva/dto/fila-carga.dto';
import { OperacionCarga } from '../../carga-masiva/enums/operacion-carga.enum';

export class FilaIndicadorDto extends FilaCargaDto {
  @Allow()
  folioJtrac?: unknown;
}

export class LoteIndicadoresDto {
  @IsEnum(OperacionCarga)
  operacion!: OperacionCarga;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => FilaIndicadorDto)
  filas!: FilaIndicadorDto[];
}
