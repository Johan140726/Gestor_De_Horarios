// test2.js - prueba mínima para verificar node y driver
console.log('INICIO test2 -', new Date().toISOString());

try {
  const sql = require('mssql/msnodesqlv8');
  console.log('require msnodesqlv8 OK');
} catch (err) {
  console.error('Fallo require msnodesqlv8:', err && err.message);
  process.exit(1);
}

(async () => {
  try {
    const sql = require('mssql/msnodesqlv8');
    const dbconfig = require('./dbconfig');
    console.log('dbconfig leido:', dbconfig);
    const cfg = {
      server: dbconfig.server,
      database: dbconfig.database,
      driver: 'msnodesqlv8',
      options: { trustedConnection: true }
    };
    console.log('intentando conectar con cfg:', cfg);
    const pool = await sql.connect(cfg);
    console.log('conectado al pool');
    const r = await pool.request().query('SELECT 1 AS OK, DB_NAME() AS DB');
    console.log('query result:', r.recordset);
    await pool.close();
    console.log('pool cerrado, FIN test2');
    process.exit(0);
  } catch (err) {
    console.error('ERROR en test2:', err && err.message);
    console.error(err);
    process.exit(1);
  }
})();
