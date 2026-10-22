import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class GuardarSlaInformeDto {
  @ApiProperty({ minimum: 1, maximum: 525600, example: 1440 })
  @IsInt()
  @Min(1)
  @Max(525600)
  slaMinutos!: number;

  @ApiProperty()
  @IsBoolean()
  activa!: boolean;
}
