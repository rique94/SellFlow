//importando o fs
const fs = require("fs");
//importando o express
const express = require("express");
const app = express();

//importando o path
const path = require("path");

//importando o json com as lojas
const storesJson = require("./data/lojas.json");
const { json } = require("stream/consumers");
//colocando as lojas em um array
const stores = storesJson;

const caminhosPedidos = {
    1: path.join(__dirname, "./data/rioNegro/pedidos.json"),
    2: path.join(__dirname, "./data/centroComercial/pedidos.json"),
    3: path.join(__dirname, "./data/conde/pedidos.json"),
};

function lerPedidos(id) {
    const caminho = caminhosPedidos[id];

    if (!caminho) {
        return null;
    }

    return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

//rota de pedidos
app.get("/dashboard/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/pages/dashboard.html"));
});

//rota para criar um novo pedido
app.get("/novo-pedido/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/pages/novo-pedido.html"));
});

//rota para verificar o login
app.post("/api/login", (req, res) => {
    console.log(req.body);

    //pegando os dados
    const usr = req.body.usr;
    const pwd = req.body.pwd;

    //verificando os dados
    for (let i = 0; i < stores.length; i++) {
        if (
            (usr == stores[i].login || usr == stores[i].tel)
            &&
            pwd == stores[i].pwd
        ) {
            console.log("Entrada bem sucedida!");
            return res.status(200).json(stores[i].id);
        }
    }
    console.log("Alguma credencial está errada!");
    res.sendStatus(401);
});

//rota pra pegar todos os dados da loja
app.get("/api/takeData/:id", (req, res) => {
    const id = req.params.id;
    let usrData;
    let usrPedidos = [];
    let json;

    //pegando os dados da loja
    for (let i = 0; i < stores.length; i++) {
        if (stores[i].id == id) {
            usrData = stores[i];

            //procurando os pedidos da rio negro
            if (id == 1) {
                usrPedidos = lerPedidos(id);

                // botando tudo dentro de um objeto
                json = {
                    usr: usrData,
                    pedidos: usrPedidos,
                };

                //enviando o objeto
                console.log("enviando dados da Rio Negro");
                return res.status(200).json(json);
            }
            else if (id == 2) {
                usrPedidos = lerPedidos(id);

                // botando tudo dentro de um objeto
                json = {
                    usr: usrData,
                    pedidos: usrPedidos,
                };

                //enviando o objeto
                console.log("enviando dados do centro comercial");
                return res.status(200).json(json);
            }
            else if (id == 3) {
                usrPedidos = lerPedidos(id);

                // botando tudo dentro de um objeto
                json = {
                    usr: usrData,
                    pedidos: usrPedidos,
                };

                //enviando o objeto
                console.log("enviando dados do Conde");
                return res.status(200).json(json);
            }
        }
    }
    res.sendStatus(401);
});

//rota de enviar pedido
app.post("/api/enviar-pedido", (req, res) => {
    console.log("Recebendo um novo pedido!!!");

    const id = req.body.loja;

    console.log(req.body);

    //pegando o arquivo conforme a loja
    if (id == 1) {
        const jsonCaminho = path.join(__dirname, "./data/rioNegro/pedidos.json"); 

        //transformando em array
        let jsonContentString = JSON.parse(fs.readFileSync(jsonCaminho, 'utf8'));
        //botando o novo pedido
        jsonContentString.push(req.body);
        //salvando em json novamente
        const jsonContent = JSON.stringify(jsonContentString);

        //sobreescrevendo o arquivo antigo ja com o novo
        fs.writeFileSync(jsonCaminho, jsonContent, 'utf8');

        console.log("Novo pedido registrado com sucesso!!!");

        res.sendStatus(200);
    }
    else if (id == 2) {
        const jsonCaminho = path.join(__dirname, "./data/centroComercial/pedidos.json"); 

        //transformando em array
        let jsonContentString = JSON.parse(fs.readFileSync(jsonCaminho, 'utf8'));
        //botando o novo pedido
        jsonContentString.push(req.body);
        //salvando em json novamente
        const jsonContent = JSON.stringify(jsonContentString);

        //sobreescrevendo o arquivo antigo ja com o novo
        fs.writeFileSync(jsonCaminho, jsonContent, 'utf8');

        console.log("Novo pedido registrado com sucesso!!!");

        res.sendStatus(200);
    }
    else if (id == 3) {
        const jsonCaminho = path.join(__dirname, "./data/conde/pedidos.json"); 

        //transformando em array
        let jsonContentString = JSON.parse(fs.readFileSync(jsonCaminho, 'utf8'));
        //botando o novo pedido
        jsonContentString.push(req.body);
        //salvando em json novamente
        const jsonContent = JSON.stringify(jsonContentString);

        //sobreescrevendo o arquivo antigo ja com o novo
        fs.writeFileSync(jsonCaminho, jsonContent, 'utf8');

        console.log("Novo pedido registrado com sucesso!!!");

        res.sendStatus(200);
    }
    else {
        res.sendStatus(401);
    }
})

//Rodando o servidor
app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000\nhttp://localhost:3000");
});
