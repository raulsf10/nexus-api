export function sumarDiasHabiles(fecha: Date, dias: number, zonaHoraria: string): Date {
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new Error('SLA inválido.');
  const formato = new Intl.DateTimeFormat('en-GB', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const comoCalendario = (instante: Date): number => {
    const partes = Object.fromEntries(
      formato.formatToParts(instante).map((p) => [p.type, p.value]),
    );
    return Date.UTC(
      +partes.year,
      +partes.month - 1,
      +partes.day,
      +partes.hour,
      +partes.minute,
      +partes.second,
      instante.getUTCMilliseconds(),
    );
  };
  const calendario = new Date(comoCalendario(fecha));
  for (let restantes = dias; restantes > 0; ) {
    calendario.setUTCDate(calendario.getUTCDate() + 1);
    if (![0, 6].includes(calendario.getUTCDay())) restantes--;
  }
  // Intl aplica el huso de la fecha destino, independientemente del huso del servidor Windows.
  let resultado = calendario.getTime();
  for (let intento = 0; intento < 4; intento++) {
    const ajuste = calendario.getTime() - comoCalendario(new Date(resultado));
    if (!ajuste) break;
    resultado += ajuste;
  }
  return new Date(resultado);
}
