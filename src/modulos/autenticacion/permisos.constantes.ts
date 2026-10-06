export const MODULO_ADMINISTRAR_PERMISOS = 'Administracion Permisos';
export const MODULOS_ADMINISTRABLES = [
  { clave: 'Carnet PDI', nombre: 'Carnet PDI’s' },
  { clave: 'Movimientos Carnet', nombre: 'Movimientos Carnet' },
  { clave: 'Carga Masiva Carnet', nombre: 'Carga Masiva · Carnet' },
  { clave: 'Carga Masiva Indicadores', nombre: 'Carga Masiva · Indicadores' },
  { clave: 'Historial Carnet', nombre: 'Historial · PDI’s' },
  { clave: 'Historial Indicadores', nombre: 'Historial · Indicadores' },
  { clave: 'Solicitudes Carnet', nombre: 'Registrar Solicitudes' },
  { clave: 'Seguimiento Solicitudes Carnet', nombre: 'Dar Seguimiento a Solicitudes' },
  { clave: 'Excepciones Carnet', nombre: 'Excepciones' },
  { clave: 'Notificaciones', nombre: 'Notificaciones' },
  { clave: 'Movimientos Indicadores', nombre: 'Movimientos Indicadores' },
  { clave: 'Carnet Indicadores', nombre: 'Carnet Indicadores' },
  { clave: 'Configuracion SLA', nombre: 'Configuración SLA' },
  { clave: MODULO_ADMINISTRAR_PERMISOS, nombre: 'Permisos de Usuarios' },
] as const;
