// index.js - Backend corregido y reforzado

const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","OPTIONS"] }));
app.use(express.json());

// ---------------------------
// CONFIGURACIÓN BD
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
// HELPERS
// ---------------------------
function normalizarHora(h) {
  if (!h) return null;
  h = String(h).trim();

  // Acepta "HH:MM" o "HH:MM:SS"
  if (/^\d{2}:\d{2}$/.test(h)) return h + ":00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(h)) return h;
  // Si viene con zona o milis, intentar extraer la parte HH:MM:SS
  const m = h.match(/(\d{2}:\d{2}:\d{2})/);
  if (m) return m[1];
  throw new Error("Formato de hora inválido: " + h);
}

function pad(n){ return n < 10 ? "0" + n : "" + n; }

function formatDateYYYYMMDD(dateObj){
  // dateObj is a Date (we'll format using UTC to avoid timezone shifts)
  const y = dateObj.getUTCFullYear();
  const m = pad(dateObj.getUTCMonth() + 1);
  const d = pad(dateObj.getUTCDate());
  return `${y}-${m}-${d}`;
}

function parseDateStringToUTCDate(datestr){
  // expects datestr "YYYY-MM-DD"
  const [y, m, d] = datestr.split("-").map(Number);
  // create Date in UTC midnight
  return new Date(Date.UTC(y, m - 1, d));
}

// -----------------------------
// ENDPOINTS
// -----------------------------

// Crear usuario
app.post("/usuarios", async (req, res) => {
  const { nombre, cargo, correo, contraseña } = req.body;
  if (!nombre || !cargo || !correo || !contraseña) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }

  try {
    const pool = await sql.connect(config);

    const existe = await pool.request()
      .input("Correo", sql.VarChar, correo)
      .query(`SELECT ID_Usuario FROM Usuarios WHERE Correo_Usuario = @Correo`);

    if (existe.recordset.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    await pool.request()
      .input("Nombre", sql.VarChar, nombre)
      .input("Cargo", sql.VarChar, cargo)
      .input("Correo", sql.VarChar, correo)
      .input("Contra", sql.VarChar, contraseña)
      .query(`
        INSERT INTO Usuarios (Nombre_Usuario, Cargo_Usuario, Correo_Usuario, Contraseña_Usuario)
        VALUES (@Nombre, @Cargo, @Correo, @Contra)
      `);

    res.json({ mensaje: "Usuario creado correctamente" });
  } catch (err) {
    console.error("Error crear usuario:", err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) {
    return res.status(400).json({ mensaje: "Correo y contraseña son obligatorios" });
  }

  try {
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input("Correo", sql.VarChar, correo)
      .query(`
        SELECT ID_Usuario, Nombre_Usuario, Cargo_Usuario, Correo_Usuario, Contraseña_Usuario
        FROM Usuarios
        WHERE Correo_Usuario = @Correo
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ mensaje: "Correo no registrado" });
    }

    const usuario = result.recordset[0];
    if (usuario.Contraseña_Usuario !== contraseña) {
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    }

    res.json({
      mensaje: "Login exitoso",
      id: usuario.ID_Usuario,
      nombre: usuario.Nombre_Usuario,
      cargo: usuario.Cargo_Usuario
    });

  } catch (err) {
    console.error("Error en /login:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generar código dinámico
app.post("/generar-codigo", async (req, res) => {
  const generarCodigo = () => Math.floor(100000 + Math.random() * 900000).toString();
  const nuevoCodigo = generarCodigo();

  try {
    const pool = await sql.connect(config);

    await pool.request()
      .input("Codigo", sql.VarChar, nuevoCodigo)
      .query(`INSERT INTO Codigos_Dinamicos (Codigo) VALUES (@Codigo)`);

    res.json({ codigo: nuevoCodigo });
  } catch (err) {
    console.error("Error generar-codigo:", err);
    res.status(500).json({ error: err.message });
  }
});

// Validar código dinámico
app.post("/validar-codigo", async (req, res) => {
  const { codigo } = req.body;
  try {
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input("Codigo", sql.VarChar, codigo)
      .query(`
        SELECT TOP 1 *
        FROM Codigos_Dinamicos
        WHERE Codigo = @Codigo
        ORDER BY Fecha_Creado DESC
      `);

    const valido = result.recordset.length > 0;
    res.json({ valido });
  } catch (err) {
    console.error("Error validar-codigo:", err);
    res.status(500).json({ error: err.message });
  }
});

// Registrar asistencia (entrada / salida)
// NOTE: fecha (string "YYYY-MM-DD") and hora ("HH:MM" or "HH:MM:SS") are expected from frontend
app.post("/asistencias", async (req, res) => {
  const { tipo, fecha, hora, idUsuario } = req.body;

  if (!tipo || !fecha || !hora || !idUsuario) {
    return res.status(400).json({ error: "Faltan campos (tipo, fecha, hora, idUsuario)" });
  }

  try {
    const pool = await sql.connect(config);

    // normalizar hora a HH:MM:SS
    const horaNormalizada = normalizarHora(hora);

    // fecha debe ser 'YYYY-MM-DD' (cadena). No crear Date que cambie por zona horaria.
    const fechaStr = String(fecha).trim();

    // Traer horario asignado exacto para esa fecha (buscamos por fecha exacta)
    const horarioRes = await pool.request()
      .input("ID_Usuario", sql.Int, idUsuario)
      .input("Fecha", sql.Date, fechaStr)
      .query(`
        SELECT TOP 1 ID_Horario, HoraEntrada, HoraSalida
        FROM Horarios
        WHERE ID_Usuario = @ID_Usuario AND Fecha = @Fecha
        ORDER BY ID_Horario DESC
      `);

    const horario = horarioRes.recordset[0];
    if (!horario) {
      return res.status(400).json({ mensaje: "⚠ No hay horario asignado para esta fecha" });
    }

    // comparar horas (convertir a Date con same base)
    const horaActual = new Date(`2000-01-01T${horaNormalizada}`);
    const horaEntradaHorario = new Date(`2000-01-01T${normalizarHora(horario.HoraEntrada)}`);

    let estado = "A tiempo";
    if (tipo === "entrada" && horaActual > horaEntradaHorario) estado = "Tarde";

    if (tipo === "entrada") {
      await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .input("ID_Horario", sql.Int, horario.ID_Horario)
        .input("Fecha", sql.Date, fechaStr)
        .input("HoraEntrada", sql.Time, horaNormalizada)
        .input("Estado", sql.VarChar(50), estado)
        .query(`
          INSERT INTO Asistencias
            (ID_Usuario, ID_Horario, Fecha_Asistencia, Hora_Entrada_Asistencia, Estado_Asistencia)
          VALUES
            (@ID_Usuario, @ID_Horario, @Fecha, @HoraEntrada, @Estado)
        `);

      return res.json({ mensaje: "Entrada registrada", estado });
    }

    if (tipo === "salida") {
      const upd = await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .input("Fecha", sql.Date, fechaStr)
        .input("HoraSalida", sql.Time, horaNormalizada)
        .query(`
          UPDATE Asistencias
          SET Hora_Salida_Asistencia = @HoraSalida
          WHERE ID_Usuario = @ID_Usuario AND Fecha_Asistencia = @Fecha
        `);

      if (upd.rowsAffected[0] === 0) {
        return res.status(400).json({ mensaje: "No existe entrada registrada para hoy" });
      }

      return res.json({ mensaje: "Salida registrada correctamente" });
    }

    res.status(400).json({ mensaje: "Tipo inválido (use entrada/salida)" });

  } catch (err) {
    console.error("Error en /asistencias:", err);
    res.status(500).json({ error: err.message });
  }
});

// Listar asistencias de un usuario
app.get("/asistencias/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID de usuario inválido" });

    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("ID_Usuario", sql.Int, id)
      .query(`
        SELECT ID_Asistencias, ID_Usuario, ID_Horario, Fecha_Asistencia,
               Hora_Entrada_Asistencia, Hora_Salida_Asistencia, Estado_Asistencia
        FROM Asistencias
        WHERE ID_Usuario = @ID_Usuario
        ORDER BY Fecha_Asistencia DESC, ID_Asistencias DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error listar asistencias:", err);
    res.status(500).json({ error: err.message });
  }
});

// Listar usuarios (agrego alias Nombre para compatibilidad con front)
app.get("/usuarios", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .query(`
        SELECT ID_Usuario, Nombre_Usuario, Cargo_Usuario
        FROM Usuarios
      `);

    // map para incluir "Nombre" además de Nombre_Usuario (si el front usa Nombre)
    const mapped = result.recordset.map(r => ({
      ID_Usuario: r.ID_Usuario,
      Nombre_Usuario: r.Nombre_Usuario,
      Nombre: r.Nombre_Usuario,
      Cargo_Usuario: r.Cargo_Usuario
    }));

    res.json(mapped);
  } catch (err) {
    console.error("Error /usuarios:", err);
    res.status(500).json({ error: err.message });
  }
});

// Crear horario por rango (versión simple - inserta cada fecha del rango)
app.post("/crear-horario-rango", async (req, res) => {
  const { idUsuario, fechaInicio, fechaFin, entrada, salida } = req.body;

  if (!idUsuario || !fechaInicio || !fechaFin || !entrada || !salida) {
    return res.status(400).json({ error: "Faltan datos." });
  }

  try {
    const pool = await sql.connect(config);

    // normalizar horas
    const HE = normalizarHora(entrada);
    const HS = normalizarHora(salida);

    // crear Date UTC para inicio y fin
    let inicioDate = parseDateStringToUTCDate(fechaInicio);
    const finDate = parseDateStringToUTCDate(fechaFin);

    // iterar inclusive por días (usando UTC para no tener shift)
    const inserts = [];
    while (inicioDate <= finDate) {
      const fechaSQL = formatDateYYYYMMDD(inicioDate); // "YYYY-MM-DD"

      // Insertar (usamos sql.VarChar para horas y sql.Date para fecha string)
      await pool.request()
        .input("ID_Usuario", sql.Int, idUsuario)
        .input("Fecha", sql.Date, fechaSQL)
        .input("HE", sql.VarChar, HE)
        .input("HS", sql.VarChar, HS)
        .query(`
          INSERT INTO Horarios (ID_Usuario, Fecha, HoraEntrada, HoraSalida)
          VALUES (@ID_Usuario, @Fecha, @HE, @HS)
        `);

      inserts.push(fechaSQL);

      // avanzar un día (UTC)
      inicioDate = new Date(inicioDate.getTime() + 24 * 60 * 60 * 1000);
    }

    res.json({ mensaje: "Horario asignado correctamente a todas las fechas.", insertados: inserts.length });
  } catch (err) {
    console.error("Error crear-horario-rango:", err);
    res.status(500).json({ error: err.message });
  }
});

// Obtener todos los horarios (para mostrar en tabla). Devuelve JOIN con usuarios y formatea la fecha.
app.get("/horarios", async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT h.ID_Horario, h.ID_Usuario, h.Fecha, h.HoraEntrada, h.HoraSalida, u.Nombre_Usuario
      FROM Horarios h
      LEFT JOIN Usuarios u ON u.ID_Usuario = h.ID_Usuario
      ORDER BY h.Fecha DESC, h.ID_Horario DESC
    `);

    // formatear filas para front
    const rows = result.recordset.map(r => {
      // Fecha puede venir como Date; formateamos a YYYY-MM-DD (sin shift)
      let fechaStr = r.Fecha;
      if (fechaStr instanceof Date) {
        // tratamos como UTC (SQL Date sin hora -> usar UTC)
        fechaStr = formatDateYYYYMMDD(new Date(Date.UTC(fechaStr.getFullYear(), fechaStr.getMonth(), fechaStr.getDate())));
      } else {
        fechaStr = String(r.Fecha).slice(0,10);
      }

      // Normalizar hora (sacar segundos si quieres HH:MM)
      const horaEntrada = String(r.HoraEntrada || "").slice(0,8);
      const horaSalida = String(r.HoraSalida || "").slice(0,8);

      return {
        ID_Horario: r.ID_Horario,
        ID_Usuario: r.ID_Usuario,
        Nombre_Usuario: r.Nombre_Usuario,
        Fecha: fechaStr,
        HoraEntrada: horaEntrada,
        HoraSalida: horaSalida
      };
    });

    res.json(rows);
  } catch (err) {
    console.error("Error GET /horarios:", err);
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
app.listen(3000, () => {
  console.log("Servidor activo en http://localhost:3000");
});
