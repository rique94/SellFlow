// Primeiro a configuração: ela fixa o fuso horário antes de qualquer data ser criada
const { NA_NUVEM, PORT, PROXIES_CONFIAVEIS, URL_DO_SITE } = require("./config");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const express = require("express");
const {
    validarCadastro,
    validarNovaSenha,
    normalizarEmail,
    emailValido,
    consultarCep,
    verificarSenha,
    hashSenha,
    somenteDigitos,
} = require("./cadastro");
const { enviarEmail } = require("./email");
const {
    protegerOrigem,
    cabecalhosSeguranca,
    criarSessao,
    lojaDaSessao,
    encerrarSessao,
    limparSessoesVencidas,
    segundosBloqueado,
    registrarErroLogin,
    registrarAcertoLogin,
    reservarLogin,
    liberarLogin,
    limitarPorIp,
} = require("./seguranca");
const { infoCiclo } = require("./ciclo");
const { iniciarBanco, fecharBanco } = require("./banco");
const {
    lojaPublica,
    buscarLojaPorId,
    buscarLojaParaLogin,
    criarLoja,
    buscarLojaPorEmail,
    atualizarEmail,
    criarRedefinicao,
    redefinicaoValida,
    redefinirSenha,
    MINUTOS_LINK,
    naLoja,
    manutencaoGeral,
    ErroLojaInexistente,
} = require("./dados");

const app = express();

// Não anuncia a tecnologia do servidor
app.disable("x-powered-by");
// Na nuvem, o IP real do visitante vem do proxy do Railway (usado nos limites de tentativas)
app.set("trust proxy", PROXIES_CONFIAVEIS || false);

// Hash usado quando o usuário não existe, para o login levar o mesmo tempo nos dois casos
let hashFicticio = null;

const PASTA_PAGINAS = path.join(__dirname, "../public/pages");

const STATUSES_PERMITIDOS = [
    "🔴Pagar",
    "🟡Retirar",
    "🟣Pagar local",
    "✅Finalizado",
    "🔵Despachar",
    "🟦Despachado",
];

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

// Venda concluída = Finalizado ou Despachado
function isStatusConcluido(status) {
    return status === "✅Finalizado" || status === "🟦Despachado";
}

// Data e hora no formato salvo nos pedidos ("22/11/2026", "14:05")
function momentoAtual() {
    const agora = new Date();
    return {
        data: agora.toLocaleDateString("pt-BR"),
        hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
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
    // Só dígitos ("1e0" e "0x1" não são ids)
    const id = /^\d{1,6}$/.test(req.params.id) ? Number(req.params.id) : NaN;
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Pedido inválido." });
        return null;
    }
    return id;
}

/* ================= Pedidos da loja logada (regras do arquivo em ciclo.js) ================= */

const comCiclo = (pedido, arquivado) => ({ ...pedido, ciclo: infoCiclo(pedido, arquivado) });
const estaArquivado = (pedido) => Boolean(pedido.arquivadoEm);

/**
 * Roda `funcao` com os pedidos da loja logada (ver naLoja em dados.js) e responde com o que ela
 * retornar: { status, corpo }. A resposta só sai depois que tudo foi gravado no banco.
 */
async function comPedidos(req, res, mensagemErro, funcao) {
    try {
        const { status, corpo } = await naLoja(req.lojaId, funcao);
        return res.status(status).json(corpo);
    } catch (error) {
        if (error instanceof ErroLojaInexistente) {
            return res.status(401).json({ error: "Faça login para continuar." });
        }
        console.error(`${mensagemErro}:`, error);
        return res.status(500).json({ error: `${mensagemErro}. Tente novamente.` });
    }
}

const naoEncontrado = { status: 404, corpo: { error: "O pedido não foi encontrado." } };

/* ================= Middlewares ================= */

// Primeiro as barreiras: domínio e origem (DNS rebinding/CSRF) e cabeçalhos de segurança
app.use(protegerOrigem);
app.use(cabecalhosSeguranca);
app.use(express.json());

// Tela de entrada: quem já está logado vai direto para os pedidos
app.get(["/", "/index.html"], async (req, res) => {
    if (await lojaDaSessao(req)) {
        return res.redirect(302, "/dashboard");
    }
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// As páginas internas só abrem pelas rotas protegidas abaixo, nunca direto pela pasta
app.use("/pages", (req, res) => res.status(404).type("text/plain").send("Não encontrado."));
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

// Rotas da API liberadas sem login
const ROTAS_PUBLICAS = ["/login", "/logout", "/cadastro", "/cep", "/senha"];
const casaRota = (lista, caminho) => lista.some((rota) => caminho === rota || caminho.startsWith(`${rota}/`));

// O resto da API exige login; a partir daqui, req.lojaId é a loja logada
app.use("/api", async (req, res, next) => {
    if (casaRota(ROTAS_PUBLICAS, req.path) || (await lojaDaSessao(req))) {
        return next();
    }
    return res.status(401).json({ error: "Faça login para continuar." });
});

/* ================= Páginas ================= */

// Página interna: sem login, volta para a tela de entrada
function paginaProtegida(arquivo) {
    return async (req, res) => {
        if (!(await lojaDaSessao(req))) {
            return res.redirect(302, "/");
        }
        res.sendFile(path.join(PASTA_PAGINAS, arquivo));
    };
}

app.get("/dashboard", paginaProtegida("dashboard.html"));
app.get("/novo-pedido", paginaProtegida("novo-pedido.html"));
app.get("/detalhes-pedido/:id", paginaProtegida("detalhes-pedido.html"));
app.get("/metricas", paginaProtegida("metricas.html"));
app.get("/conta", paginaProtegida("conta.html"));

// Páginas abertas (sem login)
app.get("/cadastro", (req, res) => res.sendFile(path.join(PASTA_PAGINAS, "cadastro.html")));
app.get("/recuperar-senha", (req, res) => res.sendFile(path.join(PASTA_PAGINAS, "recuperar-senha.html")));
app.get("/redefinir-senha", (req, res) => res.sendFile(path.join(PASTA_PAGINAS, "redefinir-senha.html")));

/* ================= API ================= */

// Login (por usuário ou telefone, com ou sem máscara)
function textoEspera(segundos) {
    if (segundos < 60) return `${segundos} segundo${segundos === 1 ? "" : "s"}`;
    const minutos = Math.ceil(segundos / 60);
    return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
}

function respostaBloqueio(res, segundos, mensagem) {
    res.setHeader("Retry-After", String(segundos));
    return res.status(429).json({ error: mensagem, espera: segundos });
}

app.post("/api/login", async (req, res) => {
    const { usr, pwd } = req.body || {};
    const usuario = typeof usr === "string" ? usr.trim() : "";

    const espera = segundosBloqueado(req.ip, usuario);
    if (espera) {
        return respostaBloqueio(res, espera, `Muitas tentativas erradas. Tente de novo em ${textoEspera(espera)}.`);
    }
    if (!reservarLogin()) {
        return respostaBloqueio(res, 1, "Aguarde um instante e tente de novo.");
    }

    try {
        const loja = usuario.length <= 100 ? await buscarLojaParaLogin(usuario, somenteDigitos) : null;
        // Confere a senha mesmo sem loja (contra um hash fictício), para o tempo de resposta
        // não revelar se o usuário existe
        const senhaConfere = await verificarSenha(typeof pwd === "string" ? pwd : "", loja ? loja.pwd : hashFicticio);

        if (loja && senhaConfere) {
            registrarAcertoLogin(req.ip, usuario);
            await criarSessao(res, loja.id);
            return res.status(200).json({ ok: true });
        }

        registrarErroLogin(req.ip, usuario);
        const bloqueio = segundosBloqueado(req.ip, usuario);
        if (bloqueio) {
            return respostaBloqueio(res, bloqueio, `Usuário ou senha incorretos. Por segurança, aguarde ${textoEspera(bloqueio)} para tentar de novo.`);
        }
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
    } finally {
        liberarLogin();
    }
});

// Sair: encerra a sessão deste navegador
app.post("/api/logout", async (req, res) => {
    await encerrarSessao(req, res);
    res.json({ ok: true });
});

// Consulta de CEP (preenche o endereço no formulário de cadastro)
const limiteCep = limitarPorIp(60, 10 * 60 * 1000, "Muitas consultas de CEP. Aguarde alguns minutos.");

app.get("/api/cep/:cep", limiteCep, async (req, res) => {
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

// Cadastro de uma nova loja (aberto: qualquer loja pode criar a sua conta)
const limiteCadastro = limitarPorIp(10, 15 * 60 * 1000, "Muitas tentativas de cadastro. Aguarde alguns minutos.");

app.post("/api/cadastro", limiteCadastro, async (req, res) => {
    const { erro, loja } = await validarCadastro(req.body);
    if (erro) {
        return res.status(400).json({ error: erro.mensagem, campo: erro.campo });
    }

    const resultado = await criarLoja(loja);
    if (resultado.conflito === "login") {
        return res.status(409).json({ error: "Este usuário já está em uso. Escolha outro.", campo: "login" });
    }
    if (resultado.conflito === "telefone") {
        return res.status(409).json({ error: "Já existe uma loja cadastrada com este telefone.", campo: "telefone" });
    }
    if (resultado.conflito === "email") {
        return res.status(409).json({ error: "Já existe uma loja cadastrada com este e-mail.", campo: "email" });
    }

    console.log(`Loja ${resultado.loja.id} cadastrada.`);
    return res.status(201).json({ loja: lojaPublica(resultado.loja) });
});

/* ================= Recuperação de senha ================= */

const escaparHtml = (texto) =>
    String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function enviarLinkRedefinicao(email) {
    const loja = await buscarLojaPorEmail(email);
    if (!loja) return;
    if (!URL_DO_SITE) {
        console.error("Defina APP_URL para enviar os links de redefinição de senha.");
        return;
    }
    const token = await criarRedefinicao(loja.id);
    if (!token) return; // já foi enviado um link há pouco

    // O token vai depois do # : essa parte do endereço não é enviada ao servidor nem aparece em logs
    const link = `${URL_DO_SITE}/redefinir-senha#${token}`;
    const nome = loja.usrName;
    await enviarEmail({
        para: loja.email,
        assunto: `Redefinir a senha da loja ${nome} · SellFlow`,
        texto:
            `Olá!\n\nRecebemos um pedido para redefinir a senha da loja "${nome}" (usuário ${loja.login}) no SellFlow.\n\n` +
            `Para criar uma senha nova, abra o link abaixo. Ele vale por ${MINUTOS_LINK} minutos e só pode ser usado uma vez:\n\n${link}\n\n` +
            `Se não foi você, ignore este e-mail: a sua senha atual continua valendo.`,
        html:
            `<p>Olá!</p><p>Recebemos um pedido para redefinir a senha da loja <strong>${escaparHtml(nome)}</strong> ` +
            `(usuário ${escaparHtml(loja.login)}) no SellFlow.</p>` +
            `<p><a href="${escaparHtml(link)}">Criar uma senha nova</a></p>` +
            `<p>O link vale por ${MINUTOS_LINK} minutos e só pode ser usado uma vez.</p>` +
            `<p>Se não foi você, ignore este e-mail: a sua senha atual continua valendo.</p>`,
    });
    console.log(`Link de redefinição de senha enviado para a loja ${loja.id}.`);
}

const limiteEsqueci = limitarPorIp(5, 15 * 60 * 1000, "Muitos pedidos de recuperação. Aguarde alguns minutos.");
const limiteRedefinir = limitarPorIp(20, 15 * 60 * 1000, "Muitas tentativas. Aguarde alguns minutos.");

/*
 * Pede o link por e-mail. A resposta é sempre a mesma e sai antes do envio, exista a loja ou não:
 * assim ninguém descobre por aqui quais e-mails têm conta.
 */
app.post("/api/senha/esqueci", limiteEsqueci, (req, res) => {
    const email = normalizarEmail(req.body?.email);
    if (!emailValido(email)) {
        return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    res.json({ ok: true });
    enviarLinkRedefinicao(email).catch((error) =>
        console.error("Não foi possível enviar o e-mail de redefinição:", error.message),
    );
});

// O link ainda vale? (a página mostra o aviso de link vencido antes de a pessoa digitar a senha)
app.post("/api/senha/verificar", limiteRedefinir, async (req, res) => {
    res.json({ valido: await redefinicaoValida(req.body?.token) });
});

app.post("/api/senha/redefinir", limiteRedefinir, async (req, res) => {
    const { token, senha, confirmarSenha } = req.body || {};
    const problema = validarNovaSenha(senha, confirmarSenha);
    if (problema) {
        return res.status(400).json({ error: problema.erro.mensagem, campo: problema.erro.campo });
    }
    const trocou = await redefinirSenha(token, await hashSenha(senha));
    if (!trocou) {
        return res.status(400).json({ error: "Este link expirou ou já foi usado. Peça um novo.", expirado: true });
    }
    return res.json({ ok: true });
});

// Dados da loja logada
app.get("/api/loja", async (req, res) => {
    const loja = await buscarLojaPorId(req.lojaId);
    if (!loja) {
        return res.status(401).json({ error: "Faça login para continuar." });
    }
    res.json(lojaPublica(loja));
});

/*
 * Cadastrar ou trocar o e-mail da loja logada. Pede a senha atual: com uma sessão esquecida
 * aberta, ninguém consegue trocar o e-mail e depois usar "Esqueci a senha" para tomar a conta.
 * Senha errada conta para o mesmo bloqueio do login.
 */
app.put("/api/loja/email", async (req, res) => {
    const loja = await buscarLojaPorId(req.lojaId);
    if (!loja) {
        return res.status(401).json({ error: "Faça login para continuar." });
    }

    const espera = segundosBloqueado(req.ip, loja.login);
    if (espera) {
        return respostaBloqueio(res, espera, `Muitas tentativas erradas. Tente de novo em ${textoEspera(espera)}.`);
    }

    const email = normalizarEmail(req.body?.email);
    if (!emailValido(email)) {
        return res.status(400).json({ error: "Informe um e-mail válido.", campo: "email" });
    }
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!(await verificarSenha(senha, loja.pwd))) {
        registrarErroLogin(req.ip, loja.login);
        const bloqueio = segundosBloqueado(req.ip, loja.login);
        if (bloqueio) {
            return respostaBloqueio(res, bloqueio, `Senha incorreta. Por segurança, aguarde ${textoEspera(bloqueio)} para tentar de novo.`);
        }
        return res.status(400).json({ error: "Senha incorreta.", campo: "senha" });
    }

    if (email === loja.email) {
        return res.json({ loja: lojaPublica(loja) });
    }
    const resultado = await atualizarEmail(loja.id, email);
    if (resultado.conflito) {
        return res.status(409).json({ error: "Já existe uma loja cadastrada com este e-mail.", campo: "email" });
    }
    console.log(`E-mail da loja ${loja.id} atualizado.`);
    res.json({ loja: lojaPublica(resultado.loja) });

    // Avisa o e-mail antigo: se não foi a loja que trocou, ela fica sabendo
    if (loja.email) {
        enviarEmail({
            para: loja.email,
            assunto: `O e-mail da loja ${loja.usrName} foi alterado · SellFlow`,
            texto:
                `Olá!\n\nO e-mail de recuperação de senha da loja "${loja.usrName}" (usuário ${loja.login}) no SellFlow ` +
                `foi trocado para ${email}. A partir de agora, os links de redefinição de senha vão para o endereço novo.\n\n` +
                `Se não foi você, entre no SellFlow, troque o e-mail de volta e fale com o suporte.`,
            html:
                `<p>Olá!</p><p>O e-mail de recuperação de senha da loja <strong>${escaparHtml(loja.usrName)}</strong> ` +
                `(usuário ${escaparHtml(loja.login)}) no SellFlow foi trocado para <strong>${escaparHtml(email)}</strong>. ` +
                `A partir de agora, os links de redefinição de senha vão para o endereço novo.</p>` +
                `<p>Se não foi você, entre no SellFlow, troque o e-mail de volta e fale com o suporte.</p>`,
        }).catch((error) => console.error("Não foi possível avisar o e-mail antigo:", error.message));
    }
});

// Lista de pedidos (os prazos de arquivamento são aplicados antes)
app.get("/api/pedidos", (req, res) =>
    comPedidos(req, res, "Não foi possível carregar os pedidos", (loja) => ({
        status: 200,
        corpo: loja.pedidos.map((pedido) => comCiclo(pedido, false)),
    })),
);

// Pedidos finalizados (concluídos há mais de 30 dias sem troca nem mudança)
app.get("/api/pedidos/arquivados", (req, res) =>
    comPedidos(req, res, "Não foi possível carregar os pedidos", (loja) => ({
        status: 200,
        corpo: loja.arquivados.map((pedido) => comCiclo(pedido, true)),
    })),
);

// Um pedido (da lista ou dos finalizados)
app.get("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    return comPedidos(req, res, "Não foi possível carregar o pedido", (loja) => {
        const pedido = loja.todos.find((item) => item.id === id);
        return pedido ? { status: 200, corpo: comCiclo(pedido, estaArquivado(pedido)) } : naoEncontrado;
    });
});

// Criar pedido
app.post("/api/pedidos", (req, res) => {
    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    return comPedidos(req, res, "Ocorreu um erro ao salvar o pedido", async (loja) => {
        // Ids dos finalizados continuam reservados (o pedido pode voltar para a lista)
        const novoId = proximoIdPedido(loja.todos);
        if (novoId === null) {
            return {
                status: 409,
                corpo: { error: `Limite de ${ID_MAXIMO} pedidos atingido. Exclua pedidos antigos para criar novos.` },
            };
        }
        const { data, hora } = momentoAtual();
        const pedidoCriado = { ...pedido, data, hora, id: novoId };
        // Já criado como venda concluída: a conclusão é agora
        if (isStatusConcluido(pedido.status)) {
            pedidoCriado.dataConclusao = data;
            pedidoCriado.horaConclusao = hora;
        }

        await loja.inserir(pedidoCriado);
        return { status: 201, corpo: { pedido: comCiclo(pedidoCriado, false) } };
    });
});

// Editar pedido (conta como mudança: o prazo de 30 dias recomeça; se estava finalizado, volta para a lista)
app.put("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    return comPedidos(req, res, "Ocorreu um erro ao salvar o pedido", async (loja) => {
        const anterior = loja.todos.find((item) => item.id === id);
        if (!anterior) return naoEncontrado;

        // Mantém id, data, hora e trocas originais; sem arquivadoEm, volta para a lista
        const { arquivadoEm, ...base } = anterior;
        const atualizado = { ...base, ...pedido, atualizadoEm: new Date().toISOString() };

        // Data de conclusão: grava ao passar para Finalizado/Despachado, mantém entre os dois
        // (Despachado -> Finalizado não muda a data) e apaga se voltar para um status pendente
        if (isStatusConcluido(pedido.status) && !isStatusConcluido(anterior.status)) {
            const { data, hora } = momentoAtual();
            atualizado.dataConclusao = data;
            atualizado.horaConclusao = hora;
        } else if (!isStatusConcluido(pedido.status)) {
            delete atualizado.dataConclusao;
            delete atualizado.horaConclusao;
        }

        await loja.salvar(atualizado);
        return { status: 200, corpo: { pedido: comCiclo(atualizado, false), restaurado: estaArquivado(anterior) } };
    });
});

// Registrar troca de peça (o prazo de 30 dias recomeça; se estava finalizado, volta para a lista)
app.post("/api/pedidos/:id/trocas", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const descricao = typeof req.body?.descricao === "string" ? req.body.descricao.trim() : "";
    if (!descricao || descricao.length > 300) {
        return res.status(400).json({ error: "Descreva a troca (até 300 caracteres)." });
    }

    return comPedidos(req, res, "Ocorreu um erro ao registrar a troca", async (loja) => {
        const anterior = loja.todos.find((item) => item.id === id);
        if (!anterior) return naoEncontrado;

        const trocas = Array.isArray(anterior.trocas) ? anterior.trocas : [];
        if (trocas.length >= 50) {
            return { status: 409, corpo: { error: "Este pedido já tem o máximo de 50 trocas registradas." } };
        }
        const { data, hora } = momentoAtual();
        const troca = { em: new Date().toISOString(), data, hora, descricao };

        const { arquivadoEm, ...base } = anterior;
        const atualizado = { ...base, trocas: [...trocas, troca] };
        await loja.salvar(atualizado);
        return { status: 201, corpo: { pedido: comCiclo(atualizado, false), restaurado: estaArquivado(anterior) } };
    });
});

// Excluir pedido (da lista ou dos finalizados)
app.delete("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    return comPedidos(req, res, "Ocorreu um erro ao excluir o pedido", async (loja) => {
        if (!loja.todos.some((item) => item.id === id)) return naoEncontrado;
        await loja.excluir(id);
        return { status: 200, corpo: { success: true } };
    });
});

// Qualquer outra rota da API que não exista
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
});

// Erros inesperados (JSON malformado, corpo grande demais, banco fora do ar...) sempre em JSON,
// sem expor stack trace nem detalhes internos
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
    console.error("Erro inesperado:", error);
    return res.status(error.status || 500).json({
        error: "Ocorreu um erro inesperado no servidor.",
    });
});

/* ================= Servidor ================= */

function escutar(endereco) {
    return new Promise((resolve, reject) => {
        const servidor = http.createServer(app);
        servidor.once("error", reject);
        servidor.listen(PORT, endereco, () => resolve(servidor));
    });
}

/*
 * Na nuvem, escuta em todos os endereços (o Railway entrega as visitas pela porta PORT).
 * No computador, só na própria máquina, nos dois endereços de loopback: no Windows "localhost"
 * costuma resolver primeiro para o IPv6 (::1), e escutando só no 127.0.0.1 o navegador
 * poderia cair em outro programa na mesma porta.
 */
async function abrirServidores() {
    if (NA_NUVEM) {
        return [await escutar(undefined)];
    }
    const servidores = [await escutar("127.0.0.1")];
    try {
        servidores.push(await escutar("::1"));
    } catch (error) {
        // Máquina sem IPv6: segue só com o 127.0.0.1
        if (!["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code)) throw error;
    }
    return servidores;
}

// Confere os prazos de arquivamento de todas as lojas ao iniciar e de hora em hora
// (também rodam sempre que uma loja abre os pedidos)
async function manutencaoAgendada() {
    try {
        await manutencaoGeral();
    } catch (error) {
        console.error("Não foi possível verificar os prazos dos pedidos:", error.message);
    }
}

// Banco pronto e hash fictício calculado: a partir daqui o app pode atender (usado também nos testes)
async function preparar() {
    const banco = await iniciarBanco();
    hashFicticio = await hashSenha(crypto.randomBytes(16).toString("hex"));
    return banco;
}

async function iniciar() {
    console.log(`Banco de dados: ${await preparar()}`);
    await limparSessoesVencidas();
    await manutencaoAgendada();
    setInterval(manutencaoAgendada, 60 * 60 * 1000).unref();

    let servidores;
    try {
        servidores = await abrirServidores();
    } catch (error) {
        if (error.code === "EADDRINUSE") {
            console.error(`A porta ${PORT} já está em uso. Feche o outro servidor do SellFlow e tente de novo.`);
            process.exit(1);
        }
        throw error;
    }
    console.log(NA_NUVEM ? `Servidor rodando na porta ${PORT}` : `Servidor rodando em http://localhost:${PORT}`);

    // Desligamento (deploy novo no Railway ou Ctrl+C): termina as requisições e fecha o banco
    let desligando = false;
    const desligar = async () => {
        if (desligando) return;
        desligando = true;
        console.log("Desligando o servidor...");
        await Promise.all(servidores.map((servidor) => new Promise((resolve) => servidor.close(resolve))));
        await fecharBanco();
        process.exit(0);
    };
    process.on("SIGTERM", desligar);
    process.on("SIGINT", desligar);
}

if (require.main === module) {
    iniciar().catch((error) => {
        console.error("Não foi possível iniciar o SellFlow:", error.message);
        process.exit(1);
    });
}

module.exports = { app, preparar, iniciar };
