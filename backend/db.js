const sql = require('mssql');

const config = {
  user: 'miUsuario',
  password: 'MiPassword123*',
  server: 'localhost\\MSSQLSERVER02',
  database: 'Gestor_De_Control_De_Horarios',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  port: 1433
};

async function conectar() {
  try {
    const pool = await sql.connect(config);
    console.log("Conectado a SQL Server!");
    return pool;
  } catch (err) {
    console.error("Error al conectar:", err);
  }
}

module.exports = conectar;
