import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AgregarCarnetDto {
  @ApiProperty({ description: 'sk_empleado (posición destino).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe a asignar.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;
}
