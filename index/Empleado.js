// empleado.js
// Lógica de registro y carga de historial para Empleado.html

const API_BASE = "http://localhost:3000";

document.getElementById("btnEntrada").addEventListener("click", () => registrar("entrada"));
document.getElementById("btnSalida").addEventListener("click", () => registrar("salida"));

/**
 * Registrar entrada o salida
 */
async function registrar(tipo) {
  try {
    const codigoIngresado = document.getElementById("codigoIngresado").value.trim();
    const id = localStorage.getItem("idUsuarioLogueado");

    if (!id) {
      alert("ERROR: No se encontró el ID del usuario en localStorage. Inicia sesión nuevamente.");
      return;
    }

    if (!codigoIngresado) {
      alert("Debe ingresar el código dinámico.");
      return;
    }

    // Validar código dinámico
    const validarResp = await fetch(`${API_BASE}/validar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigoIngresado })
    });

    if (!validarResp.ok) {
      const err = await validarResp.json().catch(()=>({}));
      throw new Error(err.error || "Error al validar código");
    }

    const validarJson = await validarResp.json();
    if (!validarJson.valido) {
      alert("Código incorrecto.");
      return;
    }

    // Fecha y hora en formato apropiado
    const fecha = new Date().toISOString().slice(0, 10);       // YYYY-MM-DD
    const hora = new Date().toTimeString().slice(0, 8);       // HH:MM:SS (SQL TIME)

    const body = {
      tipo,
      fecha,
      hora,
      idUsuario: Number(id)   // asegurar número
    };

    const resp = await fetch(`${API_BASE}/asistencias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const json = await resp.json().catch(()=>({}));

    if (!resp.ok) {
      console.error("Error backend:", json);
      alert("Error registrando asistencia: " + (json.error || json.mensaje || "Error desconocido"));
      return;
    }

    alert(`Asistencia registrada (${json.estado || "sin estado"})`);
    document.getElementById("codigoIngresado").value = "";
    await cargarHistorial();

  } catch (err) {
    console.error(err);
    alert("Error al intentar registrar asistencia: " + err.message);
  }
}

/**
 * Cargar historial del usuario y rellenar tabla
 */
async function cargarHistorial() {
  try {
    const id = localStorage.getItem("idUsuarioLogueado");
    if (!id) return;

    const resp = await fetch(`${API_BASE}/asistencias/${id}`);
    if (!resp.ok) {
      console.error("Error al obtener historial", await resp.text());
      return;
    }

    const historial = await resp.json();
    let html = "";

    historial.forEach(r => {
      html += `
        <tr>
          <td>${r.Fecha_Asistencia ? r.Fecha_Asistencia.split("T")[0] : r.Fecha_Asistencia}</td>
          <td>${r.Hora_Entrada_Asistencia || "-"}</td>
          <td>${r.Hora_Salida_Asistencia || "-"}</td>
          <td>${r.Estado_Asistencia || "-"}</td>
          <td>${r.ID_Horario || "-"}</td>
        </tr>
      `;
    });

    document.getElementById("tabla-historial").innerHTML = html;

  } catch (err) {
    console.error("Error cargarHistorial:", err);
  }
}

// Ejecutar carga inicial (si hay usuario)
document.addEventListener("DOMContentLoaded", () => {
  const id = localStorage.getItem("idUsuarioLogueado");
  if (!id) {
    // Opcional: redirigir a login
    console.warn("No hay usuario logueado en localStorage (idUsuarioLogueado)");
    // return;
  } else {
    cargarHistorial();
  }
});
