export enum EstatusInstalacion {
  INSTALADO = 'INSTALADO',
  EN_INSTALACION = 'EN INSTALACIÓN',
}

export function normalizarEstatusInstalacion(valor: unknown): EstatusInstalacion | null {
  if (typeof valor !== 'string') return null;
  const texto = valor
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (texto === 'INSTALADO') return EstatusInstalacion.INSTALADO;
  if (texto === 'EN INSTALACION') return EstatusInstalacion.EN_INSTALACION;
  return null;
}
