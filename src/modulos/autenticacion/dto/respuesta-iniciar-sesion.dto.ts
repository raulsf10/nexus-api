import { ApiProperty } from '@nestjs/swagger';

export class RespuestaIniciarSesionDto {
  @ApiProperty() token!: string;
  @ApiProperty() usuario!: string;
  @ApiProperty({ type: [String] }) modulos!: string[];
  @ApiProperty({ example: '8h' }) expiraEn!: string;
}
