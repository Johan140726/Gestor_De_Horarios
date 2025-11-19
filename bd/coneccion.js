const sql = require("mssql");

const config = {
    user: "tu_usuario",
    password: "tu_password",
    server: "localhost",
    database: "TuBase",
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function conectar() {
    try {
        await sql.connect(config);
        console.log("Conexión exitosa a SQL Server");
    } catch (err) {
        console.error("Error:", err);
    }
}

conectar();
