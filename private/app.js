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
    //pegando os dados
    const usr = req.body.usr;
    const pwd = req.body.pwd;

    //verificando os dados
    for (let i = 0; i < stores.length; i++) {
        if (
            (usr == stores[i].login || usr == stores[i].tel) &&
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
            } else if (id == 2) {
                usrPedidos = lerPedidos(id);

                // botando tudo dentro de um objeto
                json = {
                    usr: usrData,
                    pedidos: usrPedidos,
                };

                //enviando o objeto
                console.log("enviando dados do centro comercial");
                return res.status(200).json(json);
            } else if (id == 3) {
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
    const id = Number(req.body.loja);

    const jsonCaminho = caminhosPedidos[id];
    if (!jsonCaminho) {
        return res.status(400).json({ error: "Loja inválida." });
    }

    const statusesPermitidos = [
        "🔴Pagar",
        "🟡Retirar",
        "🟣Pagar local",
        "✅Finalizado",
        "🔵Despachar",
        "🟦Despachado",
    ];
    const cliente = req.body.cliente;
    if (
        !cliente ||
        typeof cliente !== "object" ||
        Array.isArray(cliente) ||
        typeof cliente.nome !== "string" ||
        !cliente.nome.trim() ||
        cliente.nome.length > 120 ||
        typeof cliente.telefone !== "string" ||
        !cliente.telefone.trim() ||
        cliente.telefone.length > 30
    ) {
        return res.status(400).json({
            error: "Informe um nome e telefone válidos para o cliente.",
        });
    }
    const camposCliente = ["endereco", "cep", "complemento"];
    if (
        camposCliente.some(
            (campo) =>
                cliente[campo] !== undefined &&
                (typeof cliente[campo] !== "string" ||
                    cliente[campo].length >
                        { endereco: 250, cep: 12, complemento: 250 }[campo]),
        )
    ) {
        return res.status(400).json({ error: "Os dados de endereço são inválidos." });
    }

    const { status } = req.body;
    const listaEnviada = req.body.listaPedidos;
    if (
        !statusesPermitidos.includes(status) ||
        !Array.isArray(listaEnviada) ||
        listaEnviada.length < 1 ||
        listaEnviada.length > 100
    ) {
        return res.status(400).json({
            error: "Informe um status válido e pelo menos um item.",
        });
    }

    const listaPedidosValida = listaEnviada.every((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return false;
        }
        const quantidade = Number(item.qtd_peca);
        const valor = Number(item.valor_peca);
        return (
            typeof item.desc_peca === "string" &&
            Boolean(item.desc_peca.trim()) &&
            item.desc_peca.length <= 160 &&
            Number.isInteger(quantidade) &&
            quantidade >= 1 &&
            quantidade <= 10000 &&
            item.valor_peca !== "" &&
            (typeof item.valor_peca === "string" ||
                typeof item.valor_peca === "number") &&
            Number.isFinite(valor) &&
            valor >= 0 &&
            valor <= 10000000 &&
            (item.tamanho === undefined ||
                (typeof item.tamanho === "string" && item.tamanho.length <= 40))
        );
    });
    if (!listaPedidosValida) {
        return res.status(400).json({
            error: "Confira a descrição, tamanho, quantidade e valor das peças.",
        });
    }

    const statusComFrete = status === "🔵Despachar" || status === "🟦Despachado";
    const freteEnviado = req.body.frete;
    const frete = statusComFrete ? Number(freteEnviado) : 0;
    if (
        statusComFrete &&
        (freteEnviado === "" ||
            !Number.isFinite(frete) ||
            frete < 0 ||
            frete > 10000000)
    ) {
        return res.status(400).json({ error: "Informe um valor de frete válido." });
    }
    if (
        freteEnviado !== undefined &&
        (!Number.isFinite(Number(freteEnviado)) ||
            Number(freteEnviado) < 0 ||
            Number(freteEnviado) > 10000000)
    ) {
        return res.status(400).json({ error: "O valor de frete é inválido." });
    }
    const pedidos = lerPedidos(id);
    const ultimoPedidoComId = [...pedidos].reverse().find((pedido) => {
        const pedidoId = Number(pedido.id);
        return Number.isInteger(pedidoId) && pedidoId >= 1 && pedidoId <= 999;
    });
    const ultimoId = ultimoPedidoComId
        ? Number(ultimoPedidoComId.id)
        : pedidos.length;
    const novoId = (ultimoId % 999) + 1;
    const listaPedidos = listaEnviada.map((item) => {
        const novaPeca = {
            desc_peca: item.desc_peca.trim(),
            qtd_peca: String(Number(item.qtd_peca)),
            valor_peca: String(Number(item.valor_peca)),
        };
        if (item.tamanho && item.tamanho.trim()) {
            novaPeca.tamanho = item.tamanho.trim();
        }
        return novaPeca;
    });
    const subtotal = listaPedidos.reduce(
        (total, item) =>
            total + Number(item.qtd_peca) * Number(item.valor_peca),
        0,
    );
    const pedidoCriado = {
        ...req.body,
        cliente: {
            nome: cliente.nome.trim(),
            telefone: cliente.telefone.trim(),
            endereco: typeof cliente.endereco === "string" ? cliente.endereco.trim() : "",
            cep: typeof cliente.cep === "string" ? cliente.cep.trim() : "",
            complemento:
                typeof cliente.complemento === "string"
                    ? cliente.complemento.trim()
                    : "",
        },
        listaPedidos,
        qtdPecas: listaPedidos.length,
        frete,
        valorTotal: Number((subtotal + frete).toFixed(2)),
        loja: String(id),
        id: novoId,
    };

    pedidos.push(pedidoCriado);
    fs.writeFileSync(jsonCaminho, JSON.stringify(pedidos), "utf8");
    return res.status(201).json({ pedido: pedidoCriado });
});

app.put("/api/pedidos/:loja/:pedido", (req, res) => {
    const idLoja = Number(req.params.loja);
    const idPedido = Number(req.params.pedido);
    const jsonCaminho = caminhosPedidos[idLoja];
    const dados = req.body;
    const statusesPermitidos = [
        "🔴Pagar",
        "🟡Retirar",
        "🟣Pagar local",
        "✅Finalizado",
        "🔵Despachar",
        "🟦Despachado",
    ];

    if (!jsonCaminho || !Number.isInteger(idPedido) || idPedido < 1) {
        return res.status(400).json({ error: "Loja ou pedido inválido." });
    }
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return res.status(400).json({ error: "Dados do pedido inválidos." });
    }

    const cliente = dados.cliente;
    if (
        !cliente ||
        typeof cliente !== "object" ||
        Array.isArray(cliente) ||
        typeof cliente.nome !== "string" ||
        !cliente.nome.trim() ||
        cliente.nome.length > 120 ||
        typeof cliente.telefone !== "string" ||
        !cliente.telefone.trim() ||
        cliente.telefone.length > 30
    ) {
        return res.status(400).json({
            error: "Informe um nome e telefone válidos para o cliente.",
        });
    }

    const camposCliente = ["endereco", "cep", "complemento"];
    if (
        camposCliente.some(
            (campo) =>
                cliente[campo] !== undefined &&
                (typeof cliente[campo] !== "string" ||
                    cliente[campo].length >
                        { endereco: 250, cep: 12, complemento: 250 }[campo]),
        )
    ) {
        return res.status(400).json({ error: "Os dados de endereço são inválidos." });
    }

    if (
        !statusesPermitidos.includes(dados.status) ||
        !Array.isArray(dados.listaPedidos) ||
        dados.listaPedidos.length < 1 ||
        dados.listaPedidos.length > 100
    ) {
        return res.status(400).json({
            error: "Informe um status válido e pelo menos um item.",
        });
    }

    const itensValidos = dados.listaPedidos.every((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return false;
        }
        const quantidade = Number(item.qtd_peca);
        const valor = Number(item.valor_peca);
        return (
            typeof item.desc_peca === "string" &&
            Boolean(item.desc_peca.trim()) &&
            item.desc_peca.length <= 160 &&
            Number.isInteger(quantidade) &&
            quantidade >= 1 &&
            quantidade <= 10000 &&
            item.valor_peca !== "" &&
            (typeof item.valor_peca === "string" ||
                typeof item.valor_peca === "number") &&
            Number.isFinite(valor) &&
            valor >= 0 &&
            valor <= 10000000 &&
            (item.tamanho === undefined ||
                (typeof item.tamanho === "string" && item.tamanho.length <= 40))
        );
    });
    if (!itensValidos) {
        return res.status(400).json({
            error: "Confira a descrição, quantidade, tamanho e valor dos itens.",
        });
    }

    const statusComFrete = dados.status === "🔵Despachar" || dados.status === "🟦Despachado";
    const freteEnviado = dados.frete;
    const frete = statusComFrete ? Number(freteEnviado) : 0;
    if (
        statusComFrete &&
        (freteEnviado === "" ||
            !Number.isFinite(frete) ||
            frete < 0 ||
            frete > 10000000)
    ) {
        return res.status(400).json({ error: "Informe um valor de frete válido." });
    }
    if (
        freteEnviado !== undefined &&
        (!Number.isFinite(Number(freteEnviado)) ||
            Number(freteEnviado) < 0 ||
            Number(freteEnviado) > 10000000)
    ) {
        return res.status(400).json({ error: "O valor de frete é inválido." });
    }

    let caminhoTemporario;
    try {
        const pedidos = lerPedidos(idLoja);
        const indicePedido = pedidos.findIndex(
            (pedido) => Number(pedido.id) === idPedido,
        );
        if (indicePedido < 0) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }

        const pedidoAtual = pedidos[indicePedido];
        const listaPedidos = dados.listaPedidos.map((item) => {
            const novoItem = {
                desc_peca: item.desc_peca.trim(),
                qtd_peca: String(Number(item.qtd_peca)),
                valor_peca: String(Number(item.valor_peca)),
            };
            if (item.tamanho) {
                novoItem.tamanho = item.tamanho.trim();
            }
            return novoItem;
        });
        const subtotal = listaPedidos.reduce(
            (total, item) =>
                total + Number(item.qtd_peca) * Number(item.valor_peca),
            0,
        );
        const pedidoAtualizado = {
            ...pedidoAtual,
            cliente: {
                nome: cliente.nome.trim(),
                telefone: cliente.telefone.trim(),
                endereco: (cliente.endereco || "").trim(),
                cep: (cliente.cep || "").trim(),
                complemento: (cliente.complemento || "").trim(),
            },
            listaPedidos,
            qtdPecas: listaPedidos.length,
            status: dados.status,
            frete,
            valorTotal: Number((subtotal + frete).toFixed(2)),
        };
        pedidos[indicePedido] = pedidoAtualizado;

        caminhoTemporario = `${jsonCaminho}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(caminhoTemporario, JSON.stringify(pedidos), "utf8");
        fs.renameSync(caminhoTemporario, jsonCaminho);

        return res.status(200).json({ pedido: pedidoAtualizado });
    } catch (error) {
        if (caminhoTemporario && fs.existsSync(caminhoTemporario)) {
            try {
                fs.unlinkSync(caminhoTemporario);
            } catch (cleanupError) {
                console.error("Falha ao remover arquivo temporário:", cleanupError);
            }
        }
        console.error("Falha ao atualizar pedido:", error);
        return res.status(500).json({
            error: "Ocorreu um erro ao salvar o pedido. Tente novamente.",
        });
    }
});

//rota de datealhes do pedido

app.get("/takePedido/:loja/:pedido", (req, res) => {
    const idLoja = Number(req.params.loja);
    const idPedido = Number(req.params.pedido);
    let pedidoCaminho;
    let pedido;
    let pedidos;
    let data;

    switch (idLoja) {
        case 1:
            pedidoCaminho = caminhosPedidos[1];

            //trasnformando em array de objetos primeiro
            pedidos = JSON.parse(fs.readFileSync(pedidoCaminho, "utf8"));

            //procurando o peido específicado
            for (let i = 0; i < pedidos.length; i++) {
                if (pedidos[i].id == idPedido) {
                    pedido = pedidos[i];
                }
            }

            data = {
                pedido: pedido,
                usr: stores[idLoja - 1]
            }

            return res.status(200).json(data);

        case 2:
            pedidoCaminho = caminhosPedidos[2];
            
            //trasnformando em array de objetos primeiro
            pedidos = JSON.parse(fs.readFileSync(pedidoCaminho, "utf8"));

            //procurando o peido específicado
            for (let i = 0; i < pedidos.length; i++) {
                if (pedidos[i].id == idPedido) {
                    pedido = pedidos[i];
                }
            }

            data = {
                pedido: pedido,
                usr: stores[idLoja - 1]
            }

            return res.status(200).json(data);

        case 3:
            pedidoCaminho = caminhosPedidos[3];
            
            //trasnformando em array de objetos primeiro
            pedidos = JSON.parse(fs.readFileSync(pedidoCaminho, "utf8"));

            //procurando o peido específicado
            for (let i = 0; i < pedidos.length; i++) {
                if (pedidos[i].id == idPedido) {
                    pedido = pedidos[i];
                }
            }

            data = {
                pedido: pedido,
                usr: stores[idLoja - 1]
            }

            return res.status(200).json(data);

        default:
            res.sendStatus(401);
    }
});

app.get("/detalhes-pedido/:loja/:pedido", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/pages/detalhes-pedido.html"))
});

//Rodando o servidor
app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000\nhttp://localhost:3000");
});
