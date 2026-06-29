import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class ActualizarFrecuenciaDto {
  @ApiProperty({ description: 'sk_empleado (posición).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;

  @ApiProperty({ description: 'Frecuencia (ej. Diario, Semanal, Mensual).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  frecuencia!: string;
}
