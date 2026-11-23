const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const {
    validarCadastro,
    consultarCep,
    verificarSenha,
    hashSenha,
    isHash,
    somenteDigitos,
} = require("./cadastro");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/* ================= Arquivos de dados ================= */

const PASTA_DADOS = path.join(__dirname, "data");
const CAMINHO_LOJA = path.join(PASTA_DADOS, "loja.json");
const CAMINHO_PEDIDOS = path.join(PASTA_DADOS, "pedidos.json");
const PASTA_PAGINAS = path.join(__dirname, "../public/pages");

const STATUSES_PERMITIDOS = [
    "🔴Pagar",
    "🟡Retirar",
    "🟣Pagar local",
    "✅Finalizado",
    "🔵Despachar",
    "🟦Despachado",
];

// Lê o arquivo a cada chamada para sempre refletir a versão atual do disco.
// Retorna null se o arquivo não existir, estiver vazio, com JSON inválido
// ou sem os dados mínimos (login e senha) — nesses casos não há loja.
function lerLoja() {
    let loja;
    try {
        loja = JSON.parse(fs.readFileSync(CAMINHO_LOJA, "utf8"));
    } catch {
        return null;
    }
    const valida =
        loja !== null &&
        typeof loja === "object" &&
        !Array.isArray(loja) &&
        typeof loja.login === "string" &&
        loja.login.trim() !== "" &&
        typeof loja.pwd === "string" &&
        loja.pwd !== "";
    return valida ? loja : null;
}

function lojaCadastrada() {
    return lerLoja() !== null;
}

// Dados da loja que podem ir para o navegador (nunca a senha)
function lojaPublica(loja) {
    const { pwd, ...dados } = loja;
    return dados;
}

function salvarLoja(loja) {
    const temporario = `${CAMINHO_LOJA}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(loja, null, 4), "utf8");
    fs.renameSync(temporario, CAMINHO_LOJA);
}

// Erro de arquivo de pedidos estragado (vira uma resposta clara, sem sobrescrever o arquivo)
class ErroArquivoPedidos extends Error {}

function mensagemArquivoPedidos(error) {
    console.error(error.message);
    return `${error.message} Corrija ou restaure o arquivo em private/data antes de continuar.`;
}

function lerPedidos() {
    if (!fs.existsSync(CAMINHO_PEDIDOS)) {
        return [];
    }
    const conteudo = fs.readFileSync(CAMINHO_PEDIDOS, "utf8");
    // Arquivo vazio = nenhum pedido ainda
    if (!conteudo.trim()) {
        return [];
    }
    let pedidos;
    try {
        pedidos = JSON.parse(conteudo);
    } catch {
        throw new ErroArquivoPedidos("O arquivo pedidos.json está com um JSON inválido.");
    }
    if (!Array.isArray(pedidos)) {
        throw new ErroArquivoPedidos("O arquivo pedidos.json não contém uma lista de pedidos.");
    }
    return pedidos;
}

// Escrita atômica: grava num temporário e renomeia, para não corromper o arquivo
function salvarPedidos(pedidos) {
    const temporario = `${CAMINHO_PEDIDOS}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(temporario, JSON.stringify(pedidos, null, 2), "utf8");
        fs.renameSync(temporario, CAMINHO_PEDIDOS);
    } catch (error) {
        if (fs.existsSync(temporario)) {
            try {
                fs.unlinkSync(temporario);
            } catch (cleanupError) {
                console.error("Falha ao remover arquivo temporário:", cleanupError);
            }
        }
        throw error;
    }
}

/* ================= Validação de pedidos ================= */

function isObjeto(valor) {
    return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

/*
 * Converte um valor numérico vindo do formulário: aceita número ou texto decimal simples
 * ("12", "49.90"). Recusa "0x10", "1e3", "Infinity", "" etc. Retorna NaN se inválido.
 */
function numeroDecimal(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : NaN;
    }
    if (typeof valor === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(valor)) {
        return Number(valor);
    }
    return NaN;
}

function isStatusComFrete(status) {
    return status === "🔵Despachar" || status === "🟦Despachado";
}

/**
 * Valida o corpo de um pedido (criação ou edição).
 * Retorna { erro } quando algo é inválido ou { pedido } já normalizado.
 */
function validarPedido(dados) {
    if (!isObjeto(dados)) {
        return { erro: "Dados do pedido inválidos." };
    }

    const { cliente } = dados;
    if (
        !isObjeto(cliente) ||
        typeof cliente.nome !== "string" ||
        !cliente.nome.trim() ||
        cliente.nome.length > 120 ||
        typeof cliente.telefone !== "string" ||
        !cliente.telefone.trim() ||
        cliente.telefone.length > 30
    ) {
        return { erro: "Informe um nome e telefone válidos para o cliente." };
    }

    const limitesEndereco = { endereco: 250, cep: 12, complemento: 250 };
    const enderecoInvalido = Object.entries(limitesEndereco).some(
        ([campo, limite]) =>
            cliente[campo] !== undefined &&
            (typeof cliente[campo] !== "string" || cliente[campo].length > limite),
    );
    if (enderecoInvalido) {
        return { erro: "Os dados de endereço são inválidos." };
    }

    const { status, listaPedidos: itens } = dados;
    if (
        !STATUSES_PERMITIDOS.includes(status) ||
        !Array.isArray(itens) ||
        itens.length < 1 ||
        itens.length > 100
    ) {
        return { erro: "Informe um status válido e pelo menos um item." };
    }

    const itensValidos = itens.every((item) => {
        if (!isObjeto(item)) {
            return false;
        }
        const quantidade = numeroDecimal(item.qtd_peca);
        const valor = numeroDecimal(item.valor_peca);
        return (
            typeof item.desc_peca === "string" &&
            Boolean(item.desc_peca.trim()) &&
            item.desc_peca.length <= 160 &&
            Number.isInteger(quantidade) &&
            quantidade >= 1 &&
            quantidade <= 10000 &&
            Number.isFinite(valor) &&
            valor >= 0 &&
            valor <= 10000000 &&
            (item.tamanho === undefined ||
                (typeof item.tamanho === "string" && item.tamanho.length <= 40))
        );
    });
    if (!itensValidos) {
        return { erro: "Confira a descrição, tamanho, quantidade e valor das peças." };
    }

    const freteEnviado = dados.frete;
    const freteNumero = numeroDecimal(freteEnviado);
    if (
        freteEnviado !== undefined &&
        (!Number.isFinite(freteNumero) || freteNumero < 0 || freteNumero > 10000000)
    ) {
        return {
            erro: isStatusComFrete(status)
                ? "Informe um valor de frete válido."
                : "O valor de frete é inválido.",
        };
    }
    if (isStatusComFrete(status) && freteEnviado === undefined) {
        return { erro: "Informe um valor de frete válido." };
    }
    const frete = isStatusComFrete(status) ? freteNumero : 0;

    const listaPedidos = itens.map((item) => {
        const peca = {
            desc_peca: item.desc_peca.trim(),
            qtd_peca: String(numeroDecimal(item.qtd_peca)),
            valor_peca: String(numeroDecimal(item.valor_peca)),
        };
        if (item.tamanho && item.tamanho.trim()) {
            peca.tamanho = item.tamanho.trim();
        }
        return peca;
    });
    const subtotal = listaPedidos.reduce(
        (total, item) => total + Number(item.qtd_peca) * Number(item.valor_peca),
        0,
    );

    return {
        pedido: {
            cliente: {
                nome: cliente.nome.trim(),
                telefone: cliente.telefone.trim(),
                endereco: (cliente.endereco || "").trim(),
                cep: (cliente.cep || "").trim(),
                complemento: (cliente.complemento || "").trim(),
            },
            listaPedidos,
            qtdPecas: listaPedidos.length,
            status,
            frete,
            valorTotal: Number((subtotal + frete).toFixed(2)),
        },
    };
}

const ID_MAXIMO = 999;

/**
 * Próximo id depois do último pedido criado (1 a 999, voltando ao 1 depois do 999),
 * pulando ids que ainda estão em uso para nunca gerar duplicados.
 */
function proximoIdPedido(pedidos) {
    const idsEmUso = new Set(
        pedidos
            .map((pedido) => Number(pedido.id))
            .filter((id) => Number.isInteger(id) && id >= 1 && id <= ID_MAXIMO),
    );
    if (idsEmUso.size >= ID_MAXIMO) {
        return null;
    }

    const ultimoComId = [...pedidos].reverse().find((pedido) => {
        const id = Number(pedido.id);
        return Number.isInteger(id) && id >= 1 && id <= ID_MAXIMO;
    });
    let candidato = ultimoComId ? Number(ultimoComId.id) : 0;
    do {
        candidato = (candidato % ID_MAXIMO) + 1;
    } while (idsEmUso.has(candidato));
    return candidato;
}

function lerIdPedido(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Pedido inválido." });
        return null;
    }
    return id;
}

/* ================= Middlewares ================= */

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Rotas que funcionam mesmo sem loja cadastrada (necessárias para o cadastro)
const ROTAS_SEM_LOJA = ["/cadastro", "/cadastro/status", "/cep"];

// Enquanto a loja não for cadastrada, o resto da API não funciona
app.use("/api", (req, res, next) => {
    const liberada = ROTAS_SEM_LOJA.some((rota) => req.path === rota || req.path.startsWith(`${rota}/`));
    if (!liberada && !lojaCadastrada()) {
        return res.status(503).json({
            error: "Nenhuma loja cadastrada nesta instalação.",
        });
    }
    next();
});

/* ================= Páginas ================= */

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(PASTA_PAGINAS, "dashboard.html"));
});

app.get("/novo-pedido", (req, res) => {
    res.sendFile(path.join(PASTA_PAGINAS, "novo-pedido.html"));
});

app.get("/detalhes-pedido/:id", (req, res) => {
    res.sendFile(path.join(PASTA_PAGINAS, "detalhes-pedido.html"));
});

app.get("/cadastro", (req, res) => {
    res.sendFile(path.join(PASTA_PAGINAS, "cadastro.html"));
});

// URLs antigas (da época com várias lojas) redirecionam para as novas
app.get("/dashboard/:loja", (req, res) => res.redirect(302, "/dashboard"));
app.get("/novo-pedido/:loja", (req, res) => res.redirect(302, "/novo-pedido"));
app.get("/detalhes-pedido/:loja/:id", (req, res) => {
    res.redirect(302, `/detalhes-pedido/${encodeURIComponent(req.params.id)}`);
});

/* ================= API ================= */

// Login (por usuário ou telefone, com ou sem máscara)
app.post("/api/login", (req, res) => {
    const { usr, pwd } = req.body || {};
    const loja = lerLoja();
    if (!loja) {
        return res.status(503).json({ error: "Nenhuma loja cadastrada nesta instalação." });
    }
    const usuario = typeof usr === "string" ? usr.trim() : "";
    const digitos = somenteDigitos(usuario);
    const usuarioConfere =
        usuario.length > 0 &&
        (usuario === loja.login || (digitos.length >= 10 && digitos === somenteDigitos(loja.tel)));

    if (usuarioConfere && verificarSenha(pwd, loja.pwd)) {
        // Loja antiga com senha em texto puro: troca por hash no primeiro login
        if (!isHash(loja.pwd)) {
            salvarLoja({ ...loja, pwd: hashSenha(pwd) });
            console.log("Senha da loja convertida para hash.");
        }
        console.log("Entrada bem sucedida!");
        return res.status(200).json({ ok: true });
    }
    console.log("Alguma credencial está errada!");
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
});

// A instalação já tem loja cadastrada?
app.get("/api/cadastro/status", (req, res) => {
    res.json({ cadastrada: lojaCadastrada() });
});

// Consulta de CEP (preenche o endereço no formulário de cadastro)
app.get("/api/cep/:cep", async (req, res) => {
    const cep = somenteDigitos(req.params.cep);
    if (cep.length !== 8) {
        return res.status(400).json({ error: "O CEP deve ter 8 dígitos." });
    }
    const consulta = await consultarCep(cep);
    if (consulta.indisponivel) {
        return res.status(503).json({ error: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente." });
    }
    if (!consulta.existe) {
        return res.status(404).json({ error: "Este CEP não existe. Confira os números." });
    }
    return res.json(consulta.dados);
});

// Cadastro da loja (só funciona enquanto não houver loja cadastrada)
app.post("/api/cadastro", async (req, res) => {
    if (lojaCadastrada()) {
        return res.status(409).json({ error: "Já existe uma loja cadastrada nesta instalação." });
    }

    const { erro, loja } = await validarCadastro(req.body);
    if (erro) {
        return res.status(400).json({ error: erro.mensagem, campo: erro.campo });
    }

    try {
        // Um loja.json vazio ou inválido não é uma loja: remove para o cadastro poder criar o novo
        if (fs.existsSync(CAMINHO_LOJA) && !lojaCadastrada()) {
            fs.unlinkSync(CAMINHO_LOJA);
        }
        // "wx" só cria se o arquivo não existir (evita dois cadastros ao mesmo tempo)
        fs.writeFileSync(CAMINHO_LOJA, JSON.stringify(loja, null, 4), { encoding: "utf8", flag: "wx" });
    } catch (error) {
        if (error.code === "EEXIST") {
            return res.status(409).json({ error: "Já existe uma loja cadastrada nesta instalação." });
        }
        throw error;
    }
    if (!fs.existsSync(CAMINHO_PEDIDOS)) {
        salvarPedidos([]);
    }

    console.log(`Loja "${loja.usrName}" cadastrada.`);
    return res.status(201).json({ loja: lojaPublica(loja) });
});

// Dados da loja
app.get("/api/loja", (req, res) => {
    const loja = lerLoja();
    if (!loja) {
        return res.status(503).json({ error: "Nenhuma loja cadastrada nesta instalação." });
    }
    res.json(lojaPublica(loja));
});

// Lista de pedidos
app.get("/api/pedidos", (req, res) => {
    res.json(lerPedidos());
});

// Um pedido
app.get("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const pedido = lerPedidos().find((item) => Number(item.id) === id);
    if (!pedido) {
        return res.status(404).json({ error: "O pedido não foi encontrado." });
    }
    res.json(pedido);
});

// Criar pedido
app.post("/api/pedidos", (req, res) => {
    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    try {
        const pedidos = lerPedidos();
        const novoId = proximoIdPedido(pedidos);
        if (novoId === null) {
            return res.status(409).json({
                error: `Limite de ${ID_MAXIMO} pedidos atingido. Exclua pedidos antigos para criar novos.`,
            });
        }
        const agora = new Date();
        const pedidoCriado = {
            ...pedido,
            data: agora.toLocaleDateString("pt-BR"),
            hora: agora.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
            }),
            id: novoId,
        };

        pedidos.push(pedidoCriado);
        salvarPedidos(pedidos);
        return res.status(201).json({ pedido: pedidoCriado });
    } catch (error) {
        if (error instanceof ErroArquivoPedidos) {
            return res.status(500).json({ error: mensagemArquivoPedidos(error) });
        }
        console.error("Falha ao criar pedido:", error);
        return res.status(500).json({
            error: "Ocorreu um erro ao salvar o pedido. Tente novamente.",
        });
    }
});

// Editar pedido
app.put("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    try {
        const pedidos = lerPedidos();
        const indice = pedidos.findIndex((item) => Number(item.id) === id);
        if (indice < 0) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }

        // Mantém id, data e hora originais
        const pedidoAtualizado = { ...pedidos[indice], ...pedido };
        pedidos[indice] = pedidoAtualizado;
        salvarPedidos(pedidos);

        return res.status(200).json({ pedido: pedidoAtualizado });
    } catch (error) {
        if (error instanceof ErroArquivoPedidos) {
            return res.status(500).json({ error: mensagemArquivoPedidos(error) });
        }
        console.error("Falha ao atualizar pedido:", error);
        return res.status(500).json({
            error: "Ocorreu um erro ao salvar o pedido. Tente novamente.",
        });
    }
});

// Excluir pedido
app.delete("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    try {
        const pedidos = lerPedidos();
        const indice = pedidos.findIndex((item) => Number(item.id) === id);
        if (indice < 0) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }

        pedidos.splice(indice, 1);
        salvarPedidos(pedidos);
        return res.status(200).json({ success: true });
    } catch (error) {
        if (error instanceof ErroArquivoPedidos) {
            return res.status(500).json({ error: mensagemArquivoPedidos(error) });
        }
        console.error("Falha ao excluir pedido:", error);
        return res.status(500).json({
            error: "Ocorreu um erro ao excluir o pedido. Tente novamente.",
        });
    }
});

// Qualquer outra rota da API que não exista
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
});

// Erros inesperados (JSON malformado, corpo grande demais...) sempre em JSON,
// sem expor stack trace ou caminhos de arquivos
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "O corpo da requisição não é um JSON válido." });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Os dados enviados são grandes demais." });
    }
    if (error instanceof ErroArquivoPedidos) {
        return res.status(500).json({ error: mensagemArquivoPedidos(error) });
    }
    console.error("Erro inesperado:", error);
    return res.status(error.status || 500).json({
        error: "Ocorreu um erro inesperado no servidor.",
    });
});

/* ================= Servidor ================= */

/*
 * Escuta apenas na própria máquina (uso local), nos dois endereços de loopback.
 * No Windows "localhost" costuma resolver primeiro para o IPv6 (::1); escutando
 * só no 127.0.0.1, o navegador poderia cair em outro programa na mesma porta.
 */
const ENDERECOS_LOCAIS = ["127.0.0.1", "::1"];
let servidoresAtivos = 0;

ENDERECOS_LOCAIS.forEach((endereco) => {
    const servidor = http.createServer(app);

    servidor.on("error", (error) => {
        // Máquina sem IPv6: segue só com o 127.0.0.1
        if (endereco === "::1" && ["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code)) {
            return;
        }
        if (error.code === "EADDRINUSE") {
            console.error(
                `A porta ${PORT} já está em uso. Feche o outro servidor do SellFlow e tente de novo.`,
            );
            process.exit(1);
        }
        throw error;
    });

    servidor.listen(PORT, endereco, () => {
        servidoresAtivos += 1;
        if (servidoresAtivos === 1) {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        }
    });
});
