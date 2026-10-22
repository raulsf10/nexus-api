import { FiltrosPlantillaDto } from '../dto/filtros-plantilla.dto';

export function filtrosPlantilla(filtros: FiltrosPlantillaDto) {
  const condiciones: string[] = [];
  const parametros: Record<string, string> = {};
  for (const campo of ['empresa', 'direccion'] as const) {
    const valor = filtros[campo]?.trim();
    if (!valor) continue;
    const columna = campo === 'empresa' ? 'pa.direccion' : 'pa.area';
    condiciones.push(`UPPER(${columna}) LIKE :${campo} ESCAPE '\\'`);
    parametros[campo] = `%${valor.toUpperCase().replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (filtros.numeroEmpleado) {
    condiciones.push('TO_CHAR(pa.num_empleado) = :numeroEmpleado');
    parametros.numeroEmpleado = filtros.numeroEmpleado;
  }
  return { condiciones, parametros };
}
