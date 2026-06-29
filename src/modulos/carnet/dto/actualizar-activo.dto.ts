import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';

export class ActualizarActivoDto {
  @ApiProperty({ description: 'sk_empleado (posición).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;

  @ApiProperty({ enum: [0, 1], description: '1 = activo, 0 = inactivo.' })
  @IsIn([0, 1])
  activo!: 0 | 1;
}
