import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'esPublico';

export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);
