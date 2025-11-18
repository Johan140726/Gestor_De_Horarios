const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { buscarUsuario } = require("./bd");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("index"));

app.post("/login", (req, res) => {
    const { usuario, password } = req.body;

    const user = buscarUsuario(usuario, password);

    if (!user) {
        return res.json({ ok: false, mensaje: "Credenciales incorrectas" });
    }

    res.json({
        ok: true,
        rol: user.rol,
        mensaje: "Acceso permitido"
    });
});

app.listen(3000, () => {
    console.log("Servidor iniciado en http://localhost:3000");
});
