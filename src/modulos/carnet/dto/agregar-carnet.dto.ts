import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { EstatusInstalacion } from '../enums/estatus-instalacion.enum';

export class AgregarCarnetDto {
  @ApiProperty({ description: 'sk_empleado (posición destino).' })
  @IsInt()
  @Min(1)
  skEmpleado!: number;

  @ApiProperty({ description: 'fk_veo del informe a asignar.' })
  @IsInt()
  @Min(1)
  fkVeo!: number;

  @ApiPropertyOptional({
    enum: EstatusInstalacion,
    nullable: true,
    description: 'Estatus inicial de instalación. Si se omite, queda vacío.',
  })
  @IsOptional()
  @IsEnum(EstatusInstalacion)
  estatusInstalacion?: EstatusInstalacion | null;
}
