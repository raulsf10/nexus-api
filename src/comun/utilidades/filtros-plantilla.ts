import { FiltrosPlantillaDto } from '../dto/filtros-plantilla.dto';

export function filtrosPlantilla(filtros: FiltrosPlantillaDto) {
  const condiciones: string[] = [];
  const parametros: Record<string, string> = {};
  for (const campo of ['empresa', 'direccion'] as const) {
    const valor = filtros[campo]?.trim();
    if (!valor) continue;
    const columna = campo === 'empresa' ? 'pa.direccion' : 'pa.area';
    condiciones.push(`UPPER(TRIM(${columna})) = :${campo}`);
    parametros[campo] = valor.toUpperCase();
  }
  if (filtros.numeroEmpleado) {
    condiciones.push('TO_CHAR(pa.num_empleado) = :numeroEmpleado');
    parametros.numeroEmpleado = filtros.numeroEmpleado;
  }
  return { condiciones, parametros };
}
