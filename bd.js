const fs = require("fs");
const path = require("path");

const rutaBD = path.join(__dirname, "bd", "usuarios.json");

function leerUsuarios() {
    const data = fs.readFileSync(rutaBD, "utf8");
    return JSON.parse(data);
}

function buscarUsuario(usuario, password) {
    const usuarios = leerUsuarios();
    return usuarios.find(
        u => u.usuario === usuario && u.password === password
    );
}

module.exports = { buscarUsuario };
