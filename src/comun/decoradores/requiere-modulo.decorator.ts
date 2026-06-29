import { SetMetadata } from '@nestjs/common';

export const CLAVE_REQUIERE_MODULO = 'requiereModulo';

export const RequiereModulo = (nombreModulo: string) =>
  SetMetadata(CLAVE_REQUIERE_MODULO, nombreModulo);
