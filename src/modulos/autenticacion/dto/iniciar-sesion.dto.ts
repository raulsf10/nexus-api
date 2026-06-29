import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class IniciarSesionDto {
  @ApiProperty({ example: 'ivan.raul', description: 'Usuario de red Sukarne (sin dominio).' })
  @IsString()
  @IsNotEmpty({ message: 'El usuario es requerido.' })
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Usuario con formato inválido.' })
  @MaxLength(64)
  usuario!: string;

  @ApiProperty({ description: 'Contraseña de red.' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida.' })
  @MaxLength(128)
  contrasena!: string;
}
