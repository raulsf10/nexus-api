const oracle = require('oracledb');
require('dotenv').config({ path: '.env.development' });

async function verificar() {
  oracle.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR });
  const conexion = await oracle.getConnection({
    user: process.env.ORACLE_USUARIO, password: process.env.ORACLE_CONTRASENA,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PUERTO}/${process.env.ORACLE_SERVICIO}`,
  });
  const url = process.env.NEXUS_PRUEBA_URL || 'http://localhost:3100/api';
  let datos;
  let token;
  let restaurar = false;
  async function llamar(ruta, metodo = 'GET', cuerpo) {
    const respuesta = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status} ${resultado.mensaje}`);
    return resultado;
  }
  try {
    for (const sentencia of [
      'INSERT INTO dwh_suka.dim_ci_carnet_estatus (fk_posicion, fk_veo, estatus_instalacion) SELECT fk_posicion, fk_veo, estatus_instalacion FROM dwh_suka.dim_ci_carnet_estatus WHERE 1 = 0',
      'UPDATE dwh_suka.dim_ci_carnet_estatus SET estatus_instalacion = estatus_instalacion WHERE 1 = 0',
      'DELETE FROM dwh_suka.dim_ci_carnet_estatus WHERE 1 = 0',
    ]) {
      try { await conexion.execute(sentencia); }
      catch (error) { console.log(JSON.stringify({ estado: 'PENDIENTE_PERMISOS_DBA', codigo: error.code })); return; }
      finally { await conexion.rollback(); }
    }
    const filas = await conexion.execute(`
      SELECT fk_posicion, fk_veo FROM (
        SELECT vc.fk_posicion, vc.fk_veo FROM dwh_suka.dim_veo_carnet vc
        WHERE vc.fk_posicion = :posicion
          AND NOT EXISTS (SELECT 1 FROM dwh_suka.dim_ci_carnet_estatus e WHERE e.fk_posicion = vc.fk_posicion AND e.fk_veo = vc.fk_veo)
          AND NOT EXISTS (SELECT 1 FROM dwh_suka.dim_ci_carnet_excepciones e WHERE e.fk_veo = vc.fk_veo AND (e.fk_posicion = vc.fk_posicion OR e.fk_posicion IS NULL))
        ORDER BY vc.fk_veo
      ) WHERE ROWNUM = 1
    `, { posicion: 52015456 });
    if (!filas.rows.length) throw new Error('No existe una asignación sin estatus para la prueba controlada');
    datos = { skEmpleado: filas.rows[0][0], fkVeo: filas.rows[0][1] };
    const sesion = await llamar('/autenticacion/iniciar-sesion', 'POST', { usuario: process.env.NEXUS_PRUEBA_USUARIO, contrasena: process.env.NEXUS_PRUEBA_PASSWORD });
    token = sesion.token;
    console.log(JSON.stringify({ prueba: 'ESTATUS_INICIO', ...datos, original: null }));
    restaurar = true;
    for (const estatusInstalacion of ['INSTALADO', 'EN INSTALACIÓN', null]) {
      await llamar('/carnet/estatus-instalacion', 'PATCH', { ...datos, estatusInstalacion });
      const consulta = await llamar(`/carnet?pagina=1&tamanioPagina=200&busqueda=${datos.skEmpleado}`);
      const registro = consulta.registros.find(f => f.idPosicion === datos.skEmpleado && f.idInforme === datos.fkVeo);
      if (!registro || registro.estatusInstalacion !== estatusInstalacion) throw new Error('El estatus no coincide en la consulta CARNET');
      const lista = await llamar(`/informes/por-usuario/${datos.skEmpleado}`);
      const asignado = lista.find(f => f.fkVeo === datos.fkVeo);
      if (!asignado || asignado.estatusInstalacion !== estatusInstalacion) throw new Error('El estatus no coincide en Movimientos CARNET');
      console.log(JSON.stringify({ prueba: 'ESTATUS_GUARDADO_Y_LEIDO', ...datos, estatusInstalacion }));
    }
    restaurar = false;
  } finally {
    if (restaurar && datos && token) await llamar('/carnet/estatus-instalacion', 'PATCH', { ...datos, estatusInstalacion: null });
    if (datos) {
      const restantes = await conexion.execute('SELECT COUNT(*) FROM dwh_suka.dim_ci_carnet_estatus WHERE fk_posicion = :skEmpleado AND fk_veo = :fkVeo', datos);
      if (restantes.rows[0][0] !== 0) throw new Error('No quedó restaurado el estatus inicial');
      console.log(JSON.stringify({ prueba: 'ESTATUS_RESTAURADO', ...datos, estatusInstalacion: null }));
    }
    await conexion.close();
  }
}
verificar().catch(error => { console.error(error.message); process.exitCode = 1; });
