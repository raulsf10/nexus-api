import { AvisoProgramadoCarnet } from './interfaces/aviso-programado.interface';
import { sumarDiasHabiles } from './dias-habiles';

export function calcularVencimiento(
  fechaInicial: Date,
  aviso: Pick<AvisoProgramadoCarnet, 'slaMinutos' | 'slaHoras' | 'diasHabiles' | 'zonaHoraria'>,
): Date {
  if (aviso.slaMinutos != null) {
    if (!Number.isInteger(aviso.slaMinutos) || aviso.slaMinutos < 1 || aviso.slaMinutos > 525600) {
      throw new Error('SLA en minutos inválido.');
    }
    return new Date(fechaInicial.getTime() + aviso.slaMinutos * 60 * 1000);
  }
  // Los pendientes anteriores conservan el calendario con el que se registraron.
  if (aviso.slaHoras == null) {
    return sumarDiasHabiles(fechaInicial, aviso.diasHabiles, aviso.zonaHoraria);
  }
  if (!Number.isInteger(aviso.slaHoras) || aviso.slaHoras < 1 || aviso.slaHoras > 8760) {
    throw new Error('SLA en horas inválido.');
  }
  return new Date(fechaInicial.getTime() + aviso.slaHoras * 60 * 60 * 1000);
}
