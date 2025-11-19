// index.js - backend corregido
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","OPTIONS"] }));
app.use(express.json());

// ---------------------------
// CONFIGURACIÓN BD (ajusta credenciales si es necesario)
// ---------------------------
const config = {
  user: 'miUsuario',
  password: 'MiPassword123*',
  server: 'localhost\\MSSQLSERVER02',
  database: 'Gestor_De_Control_De_Horarios',
  options: { encrypt: false, trustServerCertificate: true },
  port: 1433
};

// ---------------------------
// UTIL: obtener nombre del día en español
// ---------------------------
function diaEspañol(fecha = new Date()) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return dias[fecha.getDay()];
}

// ---------------------------
// LOGIN (igual que antes, opcionalmente se puede ampliar)
// ---------------------------
app.post("/login", async (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) return res.status(400).json({ mensaje: "Correo y contraseña son obligatorios" });

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("Correo", sql.VarChar, correo)
      .query(`
        SELECT ID_Usuario, Nombre_Usuario, Cargo_Usuario, Correo_Usuario, Contraseña_Usuario
        FROM Usuarios
        WHERE Correo_Usuario = @Correo
      `);

    if (result.recordset.length === 0) return res.status(401).json({ mensaje: "Correo no registrado" });

    const usuario = result.recordset[0];
    if (usuario.Contraseña_Usuario !== contraseña) return res.status(401).json({ mensaje: "Contraseña incorrecta" });

    return res.json({
      mensaje: "Login exitoso",
      id: usuario.ID_Usuario,
      nombre: usuario.Nombre_Usuario,
      cargo: usuario.Cargo_Usuario
    });

  } catch (err) {
    console.error("Error en /login:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// GENERAR CÓDIGO DINÁMICO
// ---------------------------
app.post("/generar-codigo", async (req, res) => {
  function generarCodigo() { return Math.floor(100000 + Math.random() * 900000).toString(); }
  const nuevoCodigo = generarCodigo();

  try {
    const pool = await sql.connect(config);
    await pool.request().input("Codigo", sql.VarChar, nuevoCodigo)
      .query(`INSERT INTO Codigos_Dinamicos (Codigo) VALUES (@Codigo)`);
    res.json({ codigo: nuevoCodigo });
  } catch (err) {
    console.error("Error generar-codigo:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// VALIDAR CÓDIGO DINÁMICO
// ---------------------------
app.post("/validar-codigo", async (req, res) => {
  const { codigo } = req.body;
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().input("Codigo", sql.VarChar, codigo)
      .query(`SELECT TOP 1 * FROM Codigos_Dinamicos WHERE Codigo = @Codigo ORDER BY Fecha_Creado DESC`);
    return res.json({ valido: result.recordset.length > 0 });
  } catch (err) {
    console.error("Error validar-codigo:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// OBTENER HORARIO (ID + entradas) - por usuario y dia actual
// ---------------------------
async function obtenerHorarioUsuarioHoy(idUsuario) {
  const dia = diaEspañol();
  const pool = await sql.connect(config);
  const result = await pool.request()
    .input("ID_Usuario", sql.Int, idUsuario)
    .input("Dia", sql.VarChar, dia)
    .query(`
      SELECT TOP 1 ID_Horario, Hora_Entrada, Hora_Salida
      FROM Horarios_Semanales
      WHERE ID_Usuario = @ID_Usuario AND Dia_Semana = @Dia
      ORDER BY ID_Horario DESC
    `);
  return result.recordset[0]; // puede ser undefined
}

// ---------------------------
// REGISTRAR ASISTENCIA (usa el ID_Horario del día actual)
// ---------------------------
app.post("/asistencias", async (req, res) => {
  const { tipo, fecha, hora, idUsuario } = req.body;

  if (!tipo || !fecha || !hora || !idUsuario) {
    return res.status(400).json({ error: "Faltan campos obligatorios (tipo, fecha, hora, idUsuario)" });
  }

  try {
    const pool = await sql.connect(config);

    // Normalizar hora a HH:MM:SS
    const horaNormalizada = hora.length === 5 ? hora + ":00" : hora; // admite "HH:MM" o "HH:MM:SS"
    const horaActual = new Date(`2000-01-01T${horaNormalizada}`);

    // Obtener horario del usuario para el día de hoy (hace la búsqueda y devuelve ID_Horario)
    const horario = await obtenerHorarioUsuarioHoy(idUsuario);

    if (!horario) {
      return res.status(400).json({ mensaje: "No hay horario asignado para hoy" });
    }

    const horaEntradaHorario = new Date(`2000-01-01T${horario.Hora_Entrada}`);
    let estado = "A tiempo";
    if (tipo === "entrada" && horaActual > horaEntradaHorario) estado = "Tarde";

    if (tipo === "entrada") {
      // Insertar nueva fila con ID_Horario (obligatorio en tu esquema)
      await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .input("ID_Horario", sql.Int, horario.ID_Horario)
        .input("Fecha", sql.Date, fecha)
        .input("HoraEntrada", sql.Time, horaNormalizada)
        .input("Estado", sql.VarChar(20), estado)
        .query(`
          INSERT INTO Asistencias
            (ID_Usuario, ID_Horario, Fecha_Asistencia, Hora_Entrada_Asistencia, Estado_Asistencia)
          VALUES
            (@ID_Usuario, @ID_Horario, @Fecha, @HoraEntrada, @Estado)
        `);

      return res.json({ mensaje: "Entrada registrada", estado, ID_Horario: horario.ID_Horario });
    }

    if (tipo === "salida") {
      // Actualizar la fila del día (buscamos la asistencia por usuario + fecha)
      const upd = await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .input("Fecha", sql.Date, fecha)
        .input("HoraSalida", sql.Time, horaNormalizada)
        .query(`
          UPDATE Asistencias
          SET Hora_Salida_Asistencia = @HoraSalida
          WHERE ID_Usuario = @ID_Usuario AND Fecha_Asistencia = @Fecha
        `);

      if (upd.rowsAffected[0] === 0) {
        return res.status(400).json({ mensaje: "No se encontró la entrada del día para actualizar la salida" });
      }

      return res.json({ mensaje: "Salida registrada", estado: null });
    }

    return res.status(400).json({ mensaje: "tipo inválido. Use 'entrada' o 'salida'." });

  } catch (err) {
    console.error("Error en /asistencias:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// LISTAR ASISTENCIAS (por usuario)
// ---------------------------
app.get("/asistencias/:id", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("ID_Usuario", sql.Int, req.params.id)
      .query(`
        SELECT ID_Asistencias, ID_Usuario, ID_Horario, Fecha_Asistencia, Hora_Entrada_Asistencia,
               Hora_Salida_Asistencia, Estado_Asistencia
        FROM Asistencias
        WHERE ID_Usuario = @ID_Usuario
        ORDER BY Fecha_Asistencia DESC, ID_Asistencias DESC
      `);
    return res.json(result.recordset);
  } catch (err) {
    console.error("Error listar asistencias:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// LISTAR USUARIOS
// ---------------------------
app.get("/usuarios", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT ID_Usuario, Nombre_Usuario, Cargo_Usuario FROM Usuarios
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error /usuarios:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// CREAR HORARIO SEMANAL
// ---------------------------
app.post("/crear-horario-semanal", async (req, res) => {
  const { idUsuario, dia, entrada, salida } = req.body;
  if (!idUsuario || !dia || !entrada || !salida) return res.status(400).json({ error: "Faltan campos" });

  try {
    const pool = await sql.connect(config);
    const HE = entrada.length === 5 ? entrada + ":00" : entrada;
    const HS = salida.length === 5 ? salida + ":00" : salida;

    await pool.request()
      .input("ID_Usuario", sql.Int, idUsuario)
      .input("Dia", sql.VarChar, dia)
      .input("HE", sql.VarChar, HE)
      .input("HS", sql.VarChar, HS)
      .query(`
        INSERT INTO Horarios_Semanales (ID_Usuario, Dia_Semana, Hora_Entrada, Hora_Salida)
        VALUES (@ID_Usuario, @Dia, @HE, @HS)
      `);

    res.json({ mensaje: "Horario registrado correctamente" });
  } catch (err) {
    console.error("Error crear-horario-semanal:", err);
    res.status(500).json({ error: err.message });
  }
});



// ---------------------------
// NORMALIZAR HORA HH:MM:SS
// ---------------------------
function normalizarHora(hora) {
    if (!hora) return null;
    return hora.length === 5 ? hora + ":00" : hora;
}

// ---------------------------
// OBTENER HORARIO DEL USUARIO
// ---------------------------
async function obtenerHorarioUsuario(idUsuario) {
    const pool = await sql.connect(config);

    const result = await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .query(`
            SELECT TOP 1 *
            FROM Horarios_Semanales
            WHERE ID_Usuario = @ID_Usuario
        `);

    return result.recordset[0];
}

// ---------------------------
// REGISTRAR ASISTENCIA
// ---------------------------
app.post("/asistencias", async (req, res) => {
    const { tipo, fecha, hora, idUsuario } = req.body;

    try {
        const pool = await sql.connect(config);

        const horaNormalizada = normalizarHora(hora);

        const horario = await obtenerHorarioUsuario(idUsuario);

        if (!horario) {
            return res.json({ mensaje: "No hay horario asignado" });
        }

        const idHorario = horario.ID_Horario;

        let estado = "A tiempo";

        const horaActual = new Date(`2000-01-01T${horaNormalizada}`);
        const horaEntradaHorario = new Date(`2000-01-01T${horario.Hora_Entrada}`);

        if (tipo === "entrada" && horaActual > horaEntradaHorario) {
            estado = "Tarde";
        }

        if (tipo === "entrada") {
            await pool.request()
                .input("ID_Usuario", sql.Int, idUsuario)
                .input("ID_Horario", sql.Int, idHorario)
                .input("Fecha", sql.Date, fecha)
                .input("HoraEntrada", sql.VarChar, horaNormalizada) // ← CAMBIO IMPORTANTE
                .input("Estado", sql.VarChar, estado)
                .query(`
                    INSERT INTO Asistencias
                    (ID_Usuario, ID_Horario, Fecha_Asistencia, Hora_Entrada_Asistencia, Estado_Asistencia)
                    VALUES (@ID_Usuario, @ID_Horario, @Fecha, @HoraEntrada, @Estado)
                `);
        }

        if (tipo === "salida") {
            await pool.request()
                .input("ID_Usuario", sql.Int, idUsuario)
                .input("Fecha", sql.Date, fecha)
                .input("HoraSalida", sql.VarChar, horaNormalizada) // ← CAMBIO IMPORTANTE
                .query(`
                    UPDATE Asistencias
                    SET Hora_Salida_Asistencia = @HoraSalida
                    WHERE ID_Usuario = @ID_Usuario AND Fecha_Asistencia = @Fecha
                `);
        }

        return res.json({ mensaje: "Asistencia registrada correctamente", estado });

    } catch (err) {
        console.error("Error registrando asistencia:", err);
        return res.status(500).json({ error: err.message });
    }
});



// ---------------------------
// INICIAR SERVIDOR
// ---------------------------
app.listen(3000, () => {
  console.log("Servidor activo en http://localhost:3000");
});
