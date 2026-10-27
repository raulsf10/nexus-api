import { PickType } from '@nestjs/swagger';
import { GuardarPermisosDto } from './guardar-permisos.dto';

export class GuardarPermisosPosicionDto extends PickType(GuardarPermisosDto, [
  'modulos',
] as const) {}
