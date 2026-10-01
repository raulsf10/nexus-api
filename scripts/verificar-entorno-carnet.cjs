const oracle = require('oracledb');
const sql = require('mssql');
require('dotenv').config({ path: '.env.development' });

async function verificar() {
  oracle.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR });
  const conexion = await oracle.getConnection({
    user: process.env.ORACLE_USUARIO,
    password: process.env.ORACLE_CONTRASENA,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PUERTO}/${process.env.ORACLE_SERVICIO}`,
  });
  const pool = await new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: Number(process.env.SQLSERVER_PUERTO),
    database: process.env.SQLSERVER_BD,
    user: process.env.SQLSERVER_USUARIO,
    password: process.env.SQLSERVER_CONTRASENA,
    options: { encrypt: true, trustServerCertificate: true },
  }).connect();
  try {
    if (process.argv.includes('--evidencias')) {
      const solicitudes = await pool.request().input('desde', 3).input('hasta', 8).query(`
        SELECT s.id_solicitud AS folio, s.operacion, s.estado,
          v.numero_version AS version, v.estado AS estadoVersion,
          DATALENGTH(v.archivo_solicitud_contenido) AS bytesExcel,
          DATALENGTH(v.vobo_contenido) AS bytesVobo
        FROM dbo.CI_SOLICITUD_CARNET s
        JOIN dbo.CI_SOLICITUD_CARNET_VERSION v ON v.fk_solicitud = s.id_solicitud
        WHERE s.id_solicitud BETWEEN @desde AND @hasta
        ORDER BY s.id_solicitud, v.numero_version
      `);
      console.log('EVIDENCIA_SOLICITUDES', JSON.stringify(solicitudes.recordset));
      const historial = await pool.request().input('posicion', 52015456)
        .input('usuario', 'victor.berrelleza').input('inicio', '2026-09-10T10:51:59')
        .input('fin', '2026-09-10T10:53:51').query(`
          SELECT id_historial, accion, fk_posicion, fk_veo FROM DIM_CI_CARNET_HISTORIAL
          WHERE fk_posicion = @posicion AND usuario = @usuario
            AND fecha >= CONVERT(datetime, @inicio, 126) AND fecha < CONVERT(datetime, @fin, 126)
          ORDER BY id_historial
        `);
      console.log('EVIDENCIA_HISTORIAL', JSON.stringify(historial.recordset));
    }
    if (process.argv.includes('--aplicar-operacion')) {
      const antes = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.CI_SOLICITUD_CARNET');
      const contenido = require('fs').readFileSync(require('path').join(__dirname, '../db/agregar_operacion_solicitudes.sql'), 'utf8');
      await pool.request().batch(contenido);
      const despues = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.CI_SOLICITUD_CARNET');
      console.log('MIGRACION_OPERACION_APLICADA', JSON.stringify({ antes: antes.recordset[0].total, despues: despues.recordset[0].total }));
    }
    const privilegios = await conexion.execute(`
      SELECT table_name, grantee, privilege FROM all_tab_privs
      WHERE table_schema = :esquema AND table_name IN (:estatus, :excepciones)
    `, { esquema: 'DWH_SUKA', estatus: 'DIM_CI_CARNET_ESTATUS', excepciones: 'DIM_CI_CARNET_EXCEPCIONES' });
    console.log('PRIVILEGIOS_ORACLE', JSON.stringify(privilegios.rows));
    const permisos = await pool.request().query(`
      SELECT COL_LENGTH('dbo.CI_SOLICITUD_CARNET', 'operacion') AS columnaOperacion,
        HAS_PERMS_BY_NAME('dbo.CI_SOLICITUD_CARNET', 'OBJECT', 'ALTER') AS puedeAgregarOperacion,
        (SELECT COUNT(*) FROM dbo.CI_SOLICITUD_CARNET) AS solicitudes
    `);
    console.log('SOLICITUDES_SQLSERVER', JSON.stringify(permisos.recordset));
    for (const consulta of [
      'UPDATE dwh_suka.dim_ci_carnet_estatus SET estatus_instalacion = estatus_instalacion WHERE 1 = 0',
      'INSERT INTO dwh_suka.dim_ci_carnet_estatus (fk_posicion, fk_veo, estatus_instalacion) SELECT fk_posicion, fk_veo, estatus_instalacion FROM dwh_suka.dim_ci_carnet_estatus WHERE 1 = 0',
      'DELETE FROM dwh_suka.dim_ci_carnet_estatus WHERE 1 = 0',
      'UPDATE dwh_suka.dim_ci_carnet_excepciones SET comentario = comentario WHERE 1 = 0',
      'DELETE FROM dwh_suka.dim_ci_carnet_excepciones WHERE 1 = 0',
    ]) {
      try { await conexion.execute(consulta); console.log('PERMISO_OK', consulta.split(' ').slice(0, 3).join(' ')); }
      catch (error) { console.log('PERMISO_FALTA', consulta.split(' ').slice(0, 3).join(' '), error.code); }
      finally { await conexion.rollback(); }
    }
    console.log('LIMITE_CONFIGURADO', process.env.CARGA_MASIVA_MAX_FILAS ?? 'predeterminado');
    console.log('CORREOS', process.env.ALERTA_DESTINATARIOS_DEFAULT, 'POR_POSICION', process.env.CARNET_USAR_CORREO_POSICION ?? 'false');
  } finally { await conexion.close(); await pool.close(); }
}
verificar().catch(error => { console.error(error.code ?? error.message); process.exitCode = 1; });
