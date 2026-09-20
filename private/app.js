//importando o express
const express = require('express');
const app = express();

//importando o path
const path = require('path');

app.use(express.static(path.join(__dirname, '../public')));

app.get("/novo-pedido", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/pages/novo-pedido.html"));
});

//Rodando o servidor
app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000\nhttp://localhost:3000");
});