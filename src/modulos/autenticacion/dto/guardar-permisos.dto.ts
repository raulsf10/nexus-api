import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { MODULOS_ADMINISTRABLES } from '../permisos.constantes';

export class UsuarioPermisosDto {
  @ApiProperty({ example: 'nombre.apellido', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Captura un usuario válido, sin dominio.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  usuario!: string;
}

export class GuardarPermisosDto extends UsuarioPermisosDto {
  @ApiProperty({
    type: [String],
    enum: MODULOS_ADMINISTRABLES.map((modulo) => modulo.clave),
    isArray: true,
  })
  @IsArray()
  @ArrayMaxSize(MODULOS_ADMINISTRABLES.length)
  @ArrayUnique()
  @IsIn(MODULOS_ADMINISTRABLES.map((modulo) => modulo.clave), { each: true })
  modulos!: string[];
}
