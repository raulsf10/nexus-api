import { AvisoProgramadoCarnet } from './interfaces/aviso-programado.interface';

export function calcularVencimiento(
  fechaInicial: Date,
  aviso: Pick<AvisoProgramadoCarnet, 'slaMinutos'>,
): Date {
  const minutos = aviso.slaMinutos;
  if (minutos === null || !Number.isInteger(minutos) || minutos < 1 || minutos > 525600) {
    throw new Error('SLA en minutos inválido.');
  }
  return new Date(fechaInicial.getTime() + minutos * 60 * 1000);
}
