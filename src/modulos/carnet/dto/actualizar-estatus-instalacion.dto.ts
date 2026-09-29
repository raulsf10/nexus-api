import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min, ValidateIf } from 'class-validator';
import { EstatusInstalacion } from '../enums/estatus-instalacion.enum';

export class ActualizarEstatusInstalacionDto {
  @ApiProperty({ description: 'sk_empleado (posición).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;

  @ApiProperty({
    enum: EstatusInstalacion,
    nullable: true,
    description: 'Estatus de instalación; null elimina el estatus actual.',
  })
  @ValidateIf((_, valor) => valor !== null)
  @IsEnum(EstatusInstalacion)
  estatusInstalacion!: EstatusInstalacion | null;
}
