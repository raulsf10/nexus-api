const { Workbook } = require('exceljs');
const oracle = require('oracledb');
const sql = require('mssql');
const { createHash } = require('crypto');
require('dotenv').config({ path: '.env.development' });

const url = process.env.NEXUS_PRUEBA_URL || 'http://localhost:3100/api';
const posicion = 52015456;
const informes = [1, 2];
const marca = `VALIDACION NEXUS ${new Date().toISOString()}`;
const evidencias = [];
const solicitudes = [];
let token;
let conexion;
let pool;
let baseConfirmada = false;
const vobo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}
function evidencia(nombre, detalle) {
  const registro = { fecha: new Date().toISOString(), nombre, detalle };
  evidencias.push(registro);
  console.log(JSON.stringify(registro));
}
async function peticion(ruta, metodo = 'GET', cuerpo, codigo = 200) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const form = cuerpo instanceof FormData;
  if (cuerpo && !form) headers['Content-Type'] = 'application/json';
  const respuesta = await fetch(`${url}${ruta}`, {
    method: metodo, headers, body: cuerpo ? (form ? cuerpo : JSON.stringify(cuerpo)) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const datos = await respuesta.json();
  asegurar(respuesta.status === codigo, `${metodo} ${ruta}: HTTP ${respuesta.status}; ${datos.mensaje ?? 'respuesta inesperada'}`);
  return datos;
}
async function excel(ids, cantidad) {
  const libro = new Workbook();
  const hoja = libro.addWorksheet('Solicitud');
  hoja.addRow(['ID POSICIÓN', 'ID INFORME', 'FRECUENCIA DE USO']);
  for (let n = 0; n < (cantidad ?? ids.length); n++) hoja.addRow([posicion, ids[n % ids.length], null]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
async function estadoReal() {
  const ora = await conexion.execute('SELECT fk_veo FROM dwh_suka.dim_veo_carnet WHERE fk_posicion = :p AND fk_veo IN (:i1, :i2) ORDER BY fk_veo', { p: posicion, i1: informes[0], i2: informes[1] });
  const espejo = await pool.request().input('p', posicion).input('i1', informes[0]).input('i2', informes[1]).query('SELECT fk_veo AS id FROM DIM_VEO_CARNET_SUKA WHERE fk_posicion = @p AND fk_veo IN (@i1, @i2) ORDER BY fk_veo');
  return { oracle: ora.rows.map(f => f[0]), sqlServer: espejo.recordset.map(f => f.id) };
}
async function comprobarAsignaciones(esperadas, nombre) {
  const real = await estadoReal();
  asegurar(JSON.stringify(real.oracle) === JSON.stringify(esperadas), `${nombre}: Oracle difiere: ${JSON.stringify(real)}`);
  asegurar(JSON.stringify(real.sqlServer) === JSON.stringify(esperadas), `${nombre}: espejo difiere: ${JSON.stringify(real)}`);
  evidencia(nombre, { posicion, ...real });
}
async function crear(operacion, escenario, ids = informes, anterior, codigo = 201) {
  const archivo = await excel(ids);
  const datos = new FormData();
  datos.set('operacion', operacion);
  datos.set('comentario', `${marca} - ${escenario}`);
  datos.set('archivoSolicitud', new Blob([archivo]), `VALIDACION-${escenario}.xlsx`);
  datos.set('vobo', new Blob([vobo], { type: 'image/png' }), `VALIDACION-${escenario}.png`);
  const ruta = anterior ? `/solicitudes-carnet/${anterior}/versiones` : '/solicitudes-carnet';
  const creada = await peticion(ruta, 'POST', datos, codigo);
  if (codigo !== 201) return creada;
  if (!anterior) solicitudes.push({ ...creada, operacion, escenario });
  evidencia('SOLICITUD_CREADA', { ...creada, operacion, escenario });
  const detalle = await peticion(`/solicitudes-carnet/${creada.idSolicitud}`);
  asegurar(detalle.operacion === operacion, 'No se conservó la operación');
  const version = detalle.versiones.find(v => v.idVersion === creada.idVersion);
  asegurar(version?.filas.length === ids.length, 'Cantidad incorrecta de filas');
  for (const [segmento, original] of [['archivo-solicitud', archivo], ['vobo', vobo]]) {
    const respuesta = await fetch(`${url}/solicitudes-carnet/versiones/${creada.idVersion}/${segmento}`, { headers: { Authorization: `Bearer ${token}` } });
    asegurar(respuesta.ok, 'No se pudo descargar el archivo desde SQL Server');
    const recibido = Buffer.from(await respuesta.arrayBuffer());
    asegurar(createHash('sha256').update(recibido).digest('hex') === createHash('sha256').update(original).digest('hex'), 'El archivo descargado no coincide');
  }
  evidencia('ARCHIVOS_BDD_IDENTICOS', { idVersion: creada.idVersion, excel: true, vobo: true });
  return { ...creada, version, detalle };
}
async function revisar(solicitud, aprobadas, estado, comentario = 'Revisión controlada de validación') {
  const resultado = await peticion(`/solicitudes-carnet/versiones/${solicitud.idVersion}/revision`, 'PATCH', { filasAprobadas: aprobadas, comentario: `${marca} - ${comentario}` });
  asegurar(resultado.estado === estado, `Estado de revisión esperado: ${estado}`);
  const detalle = await peticion(`/solicitudes-carnet/${solicitud.idSolicitud}`);
  asegurar(detalle.estado === estado, 'El estado de cabecera no coincide');
  asegurar(estado === 'APROBADA_PARCIAL' ? detalle.fechaCierre === null : !!detalle.fechaCierre, 'Fecha de cierre incorrecta');
  const version = detalle.versiones.find(v => v.idVersion === solicitud.idVersion);
  asegurar(version.filas.every(f => f.estado === (aprobadas.includes(f.idFila) ? 'APROBADA' : 'NO_APROBADA')), 'Estados de las filas incorrectos');
  evidencia('REVISION', { idSolicitud: solicitud.idSolicitud, idVersion: solicitud.idVersion, estado, fechaCierre: detalle.fechaCierre, filas: version.filas.map(f => ({ informe: f.idInforme, estado: f.estado })) });
  return detalle;
}
const todas = s => s.version.filas.map(f => f.idFila);

async function comprobarLimites() {
  for (const cantidad of [2000, 2001]) {
    const archivo = await excel([1], cantidad);
    const formulario = new FormData();
    formulario.set('operacion', 'asignacion');
    formulario.set('archivo', new Blob([archivo]), `limite-${cantidad}.xlsx`);
    const resultado = await peticion('/carga-masiva/validar', 'POST', formulario, cantidad === 2000 ? 200 : 400);
    asegurar(cantidad === 2000 ? resultado.totalFilas === 2000 : resultado.mensaje.includes('2000'), 'Límite Excel incorrecto');
    evidencia('LIMITE_EXCEL', { cantidad, aceptado: cantidad === 2000, filasConError: resultado.filasConError, nota: 'Solo validación; filas repetidas deliberadamente, sin procesar.' });
  }
  const filas = Array.from({ length: 2000 }, (_, indice) => ({ fila: indice + 2, idPosicion: 'identificador-invalido-para-validacion', idInforme: 'identificador-invalido-para-validacion', frecuencia: null }));
  const resultado = await peticion('/carga-masiva/procesar', 'POST', { operacion: 'asignacion', filas }, 400);
  asegurar(resultado.mensaje.includes('identificadores inválidos'), 'El lote JSON no llegó al procesador');
  evidencia('JSON_2000_SIN_ERROR_413', { bytes: Buffer.byteLength(JSON.stringify(filas)), mensaje: resultado.mensaje });
}
async function comprobarExcepciones() {
  const { CarnetConsultaRepositoryOracle } = require('../dist/modulos/carnet/carnet-consulta.repository.oracle');
  const repositorio = Object.create(CarnetConsultaRepositoryOracle.prototype);
  const filtro = repositorio.clausulaFiltros(undefined, false, true).replace('dwh_suka.dim_ci_carnet_excepciones', 'reglas');
  for (const idPosicion of [null, posicion]) {
    const resultado = await conexion.execute(`
      WITH datos AS (
        SELECT :p1 fk_posicion, :i1 fk_veo FROM dual UNION ALL
        SELECT :p2, :i1 FROM dual UNION ALL SELECT :p1, :i2 FROM dual
      ), reglas AS (SELECT CAST(:excepcion AS NUMBER) fk_posicion, :i1 fk_veo FROM dual)
      SELECT vc.fk_posicion, vc.fk_veo FROM datos vc ${filtro}
      ORDER BY vc.fk_posicion, vc.fk_veo
    `, { p1: posicion, p2: 52000000, i1: 1, i2: 2, excepcion: idPosicion });
    asegurar(resultado.rows.length === (idPosicion === null ? 1 : 2), 'Filtro de excepciones incorrecto');
    asegurar(!resultado.rows.some(f => f[1] === 1 && (idPosicion === null || f[0] === posicion)), 'No excluyó la excepción');
    evidencia('EXCEPCION_FILTRO_ORACLE', { idPosicion, resultados: resultado.rows, metodo: 'Predicado del repositorio ejecutado sobre filas en memoria de Oracle, sin INSERT.' });
  }
}
async function ejecutar() {
  asegurar(process.argv.includes('--produccion'), 'Se requiere --produccion para ejecutar escenarios autorizados');
  asegurar(process.env.NEXUS_PRUEBA_USUARIO && process.env.NEXUS_PRUEBA_PASSWORD, 'Faltan credenciales de prueba en variables de entorno');
  oracle.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR });
  conexion = await oracle.getConnection({ user: process.env.ORACLE_USUARIO, password: process.env.ORACLE_CONTRASENA, connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PUERTO}/${process.env.ORACLE_SERVICIO}` });
  pool = await new sql.ConnectionPool({ server: process.env.SQLSERVER_HOST, port: Number(process.env.SQLSERVER_PUERTO), database: process.env.SQLSERVER_BD, user: process.env.SQLSERVER_USUARIO, password: process.env.SQLSERVER_CONTRASENA, options: { encrypt: true, trustServerCertificate: true } }).connect();
  try {
    await comprobarAsignaciones([], 'BASE_SIN_ASIGNACIONES');
    const estados = await conexion.execute('SELECT COUNT(*) FROM dwh_suka.dim_ci_carnet_estatus WHERE fk_posicion = :p AND fk_veo IN (:i1, :i2)', { p: posicion, i1: 1, i2: 2 });
    asegurar(estados.rows[0][0] === 0, 'Existen estatus previos para los pares de prueba');
    baseConfirmada = true;
    const sesion = await peticion('/autenticacion/iniciar-sesion', 'POST', { usuario: process.env.NEXUS_PRUEBA_USUARIO, contrasena: process.env.NEXUS_PRUEBA_PASSWORD });
    token = sesion.token;
    const persona = await peticion(`/usuarios/${posicion}`);
    evidencia('USUARIO_Y_POSICION', { usuario: sesion.usuario, posicion, descripcion: persona.descripcion });
    await comprobarLimites();
    await comprobarExcepciones();

    const rechazoAlta = await crear('asignacion', 'alta-rechazada');
    await peticion(`/solicitudes-carnet/versiones/${rechazoAlta.idVersion}/revision`, 'PATCH', { filasAprobadas: [] }, 400);
    evidencia('RECHAZO_EXIGE_COMENTARIO', { idVersion: rechazoAlta.idVersion });
    await revisar(rechazoAlta, [], 'RECHAZADA', 'Rechazo de prueba: documentación insuficiente');
    await crear('asignacion', 'no-reabrir-rechazada', informes, rechazoAlta.idSolicitud, 409);
    await comprobarAsignaciones([], 'RECHAZO_ALTA_SIN_CAMBIOS');

    const alta = await crear('asignacion', 'alta-aprobada');
    await revisar(alta, todas(alta), 'APROBADA');
    await comprobarAsignaciones(informes, 'ALTA_TOTAL_APLICADA');
    await peticion(`/solicitudes-carnet/versiones/${alta.idVersion}/revision`, 'PATCH', { filasAprobadas: todas(alta) }, 409);
    evidencia('DOBLE_REVISION_BLOQUEADA', { idVersion: alta.idVersion });

    const rechazoBaja = await crear('eliminacion', 'baja-rechazada');
    await revisar(rechazoBaja, [], 'RECHAZADA', 'Rechazo de prueba: informes aún requeridos');
    await crear('eliminacion', 'no-reabrir-rechazada', informes, rechazoBaja.idSolicitud, 409);
    await comprobarAsignaciones(informes, 'RECHAZO_BAJA_SIN_CAMBIOS');

    const bajaParcial = await crear('eliminacion', 'baja-parcial');
    await revisar(bajaParcial, [bajaParcial.version.filas[0].idFila], 'APROBADA_PARCIAL');
    await comprobarAsignaciones([2], 'BAJA_PARCIAL_SOLO_INFORME_1');
    await crear('asignacion', 'no-cambiar-operacion', [2], bajaParcial.idSolicitud, 400);
    const bajaV2 = await crear('eliminacion', 'baja-parcial-version-2', [2], bajaParcial.idSolicitud);
    const bajaCompleta = await revisar(bajaV2, todas(bajaV2), 'APROBADA');
    asegurar(bajaCompleta.versiones.length === 2 && bajaCompleta.versiones[0].estado === 'APROBADA_PARCIAL', 'No se conservó el tracking de baja');
    await comprobarAsignaciones([], 'BAJA_VERSION_2_CERRADA');

    const altaParcial = await crear('asignacion', 'alta-parcial');
    await revisar(altaParcial, [altaParcial.version.filas[0].idFila], 'APROBADA_PARCIAL');
    await comprobarAsignaciones([1], 'ALTA_PARCIAL_SOLO_INFORME_1');
    const altaV2 = await crear('asignacion', 'alta-parcial-version-2', [2], altaParcial.idSolicitud);
    const altaCompleta = await revisar(altaV2, todas(altaV2), 'APROBADA');
    asegurar(altaCompleta.versiones.length === 2 && altaCompleta.versiones[0].estado === 'APROBADA_PARCIAL', 'No se conservó el tracking de alta');
    await comprobarAsignaciones(informes, 'ALTA_VERSION_2_CERRADA');

    const baja = await crear('eliminacion', 'baja-aprobada');
    await revisar(baja, todas(baja), 'APROBADA');
    await comprobarAsignaciones([], 'ESTADO_INICIAL_RESTAURADO');
    evidencia('ESCENARIOS_COMPLETOS', { solicitudes, posicion, informes, conservado: 'Solicitudes, versiones, archivos y auditoría; las asignaciones de prueba quedaron eliminadas.' });
  } finally {
    if (baseConfirmada && token) {
      const actual = await estadoReal();
      if (actual.oracle.length) {
        await peticion('/carnet/lote', 'DELETE', { skEmpleado: posicion, fkVeos: actual.oracle });
        evidencia('REVERSION_FINAL', { posicion, informes: actual.oracle });
      }
      await comprobarAsignaciones([], 'CONFIRMACION_FINAL_ORACLE_Y_ESPEJO');
    }
    await conexion.close();
    await pool.close();
  }
}
ejecutar().catch(error => { console.error(JSON.stringify({ error: error.message, solicitudes })); process.exitCode = 1; });
