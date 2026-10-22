// Ambas fechas son hora local de SQL Server, sin sufijo de zona.
export function minutosHabilesEntre(inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null;
  const desde = Date.parse(`${inicio}Z`);
  const hasta = Date.parse(`${fin}Z`);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) return null;
  let cursor = desde;
  let milisegundos = 0;
  while (cursor < hasta) {
    const fecha = new Date(cursor);
    const siguiente = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + 1);
    const limite = Math.min(siguiente, hasta);
    if (fecha.getUTCDay() !== 0 && fecha.getUTCDay() !== 6) milisegundos += limite - cursor;
    cursor = limite;
  }
  return Math.floor(milisegundos / 60000);
}
