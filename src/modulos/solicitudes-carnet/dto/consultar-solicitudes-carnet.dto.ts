import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum VistaSolicitudesCarnet {
  MIS_SOLICITUDES = 'mis-solicitudes',
  SEGUIMIENTO = 'seguimiento',
}

export class ConsultarSolicitudesCarnetDto {
  @ApiPropertyOptional({
    enum: VistaSolicitudesCarnet,
    default: VistaSolicitudesCarnet.MIS_SOLICITUDES,
  })
  @IsOptional()
  @IsEnum(VistaSolicitudesCarnet)
  vista?: VistaSolicitudesCarnet;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanioPagina?: number;
}
