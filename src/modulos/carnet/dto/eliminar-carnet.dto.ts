import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class EliminarCarnetDto {
  @ApiProperty({ description: 'sk_empleado (posición).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe a eliminar del carnet.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;
}
