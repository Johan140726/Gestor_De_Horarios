const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// PUERTO DEL SERVIDOR
const port = 3000;

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
// Probar conexión
app.get('/test', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT TOP 1 * FROM Usuarios');
        res.json(result.recordset);
    } catch (err) {
        console.error("Error SQL:", err);
        res.status(500).send(err.message);
    }
});

// Ruta principal
app.get("/", (req, res) => {
    res.send("API funcionando correctamente");
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

app.post("/usuarios", async (req, res) => {
    const { nombre, cargo, correo, contraseña } = req.body;

    try {
        const pool = await sql.connect(config);

        await pool.request()
            .input("Nombre_Usuario", sql.VarChar, nombre)
            .input("Cargo_Usuario", sql.VarChar, cargo)
            .input("Correo_Usuario", sql.VarChar, correo)
            .input("Contraseña_Usuario", sql.VarChar, contraseña)
            .query(`
                INSERT INTO Usuarios (Nombre_Usuario, Cargo_Usuario, Correo_Usuario, Contraseña_Usuario)
                VALUES (@Nombre_Usuario, @Cargo_Usuario, @Correo_Usuario, @Contraseña_Usuario)
            `);

        res.json({ mensaje: "Usuario registrado correctamente" });

    } catch (err) {
        res.status(500).json({ error: err.message });  // ← CORRECTO
    }
}); 


// obtener todos los usuarios 

app.get("/usuarios", async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const resultado = await pool.request().query(`
            SELECT ID_Usuario, Nombre_Usuario, Cargo_Usuario, Correo_Usuario
            FROM Usuarios
        `);

        res.json(resultado.recordset);

    } catch (err) {
        console.error("Error al consultar usuarios:", err);
        res.status(500).json({ error: "Error al consultar usuarios" });
    }
});



