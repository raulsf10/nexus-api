import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class EliminarLoteCarnetDto {
  @ApiProperty({ description: 'sk_empleado (posición origen).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ type: [Number], description: 'fk_veo de los informes a eliminar.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  fkVeos!: number[];
}
