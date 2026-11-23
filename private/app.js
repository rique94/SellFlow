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
const {
    exigirHostLocal,
    cabecalhosSeguranca,
    criarSessao,
    sessaoValida,
    encerrarSessao,
    segundosBloqueado,
    registrarErroLogin,
    registrarAcertoLogin,
    reservarLogin,
    liberarLogin,
} = require("./seguranca");
const { infoCiclo, verificarPrazos } = require("./ciclo");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Não anuncia a tecnologia do servidor
app.disable("x-powered-by");

// Hash usado quando o usuário não existe, para o login levar o mesmo tempo nos dois casos
let hashFicticio = null;
hashSenha(require("crypto").randomBytes(16).toString("hex")).then((hash) => (hashFicticio = hash));

/* ================= Arquivos de dados ================= */

const PASTA_DADOS = path.join(__dirname, "data");
const CAMINHO_LOJA = path.join(PASTA_DADOS, "loja.json");
const CAMINHO_PEDIDOS = path.join(PASTA_DADOS, "pedidos.json");
// Pedidos concluídos há mais de 30 dias sem troca nem mudança (ver ciclo.js)
const CAMINHO_FINALIZADOS = path.join(PASTA_DADOS, "finalizados.json");
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

function lerLista(caminho) {
    if (!fs.existsSync(caminho)) {
        return [];
    }
    const conteudo = fs.readFileSync(caminho, "utf8");
    // Arquivo vazio = nenhum pedido ainda
    if (!conteudo.trim()) {
        return [];
    }
    const nome = path.basename(caminho);
    let pedidos;
    try {
        pedidos = JSON.parse(conteudo);
    } catch {
        throw new ErroArquivoPedidos(`O arquivo ${nome} está com um JSON inválido.`);
    }
    if (!Array.isArray(pedidos)) {
        throw new ErroArquivoPedidos(`O arquivo ${nome} não contém uma lista de pedidos.`);
    }
    return pedidos;
}

const lerPedidos = () => lerLista(CAMINHO_PEDIDOS);
const lerArquivados = () => lerLista(CAMINHO_FINALIZADOS);
const salvarPedidos = (pedidos) => salvarLista(CAMINHO_PEDIDOS, pedidos);
const salvarArquivados = (pedidos) => salvarLista(CAMINHO_FINALIZADOS, pedidos);

// Escrita atômica: grava num temporário e renomeia, para não corromper o arquivo
function salvarLista(caminho, pedidos) {
    const temporario = `${caminho}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(temporario, JSON.stringify(pedidos, null, 2), "utf8");
        fs.renameSync(temporario, caminho);
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

/* ================= Arquivo de finalizados (regras em ciclo.js) ================= */

// Arquiva os concluídos parados há 30 dias e apaga os que estão no arquivo há 30 dias
function manutencaoPedidos(agora = new Date()) {
    const resultado = verificarPrazos(lerPedidos(), lerArquivados(), agora);
    if (!resultado.mudou) {
        return resultado;
    }
    // Primeiro grava o arquivo, depois tira da lista: se algo falhar no meio, o pedido
    // fica nos dois lugares (e vale a cópia da lista), nunca em nenhum
    salvarArquivados(resultado.arquivados);
    salvarPedidos(resultado.pedidos);
    if (resultado.arquivadosAgora) {
        console.log(`${resultado.arquivadosAgora} pedido(s) concluído(s) sem troca há 30 dias foram para finalizados.json.`);
    }
    if (resultado.apagados) {
        console.log(`${resultado.apagados} pedido(s) arquivado(s) há 30 dias foram apagados.`);
    }
    return resultado;
}

const comCiclo = (pedido, arquivado) => ({ ...pedido, ciclo: infoCiclo(pedido, arquivado) });

// Procura o pedido na lista e, se não achar, no arquivo de finalizados
function localizarPedido(id) {
    const pedidos = lerPedidos();
    const indice = pedidos.findIndex((item) => Number(item.id) === id);
    if (indice >= 0) {
        return { pedidos, indice, arquivado: false };
    }
    const arquivados = lerArquivados();
    const indiceArquivo = arquivados.findIndex((item) => Number(item.id) === id);
    if (indiceArquivo >= 0) {
        return { pedidos, arquivados, indice: indiceArquivo, arquivado: true };
    }
    return null;
}

// Grava um pedido alterado. Se estava arquivado, volta para a lista (o prazo de 30 dias recomeça).
function gravarPedidoAlterado(local, pedido) {
    if (!local.arquivado) {
        local.pedidos[local.indice] = pedido;
        salvarPedidos(local.pedidos);
        return pedido;
    }
    const { arquivadoEm, ...restaurado } = pedido;
    // Volta na posição do id, para a ordem de criação da lista continuar certa
    const posicao = local.pedidos.findIndex((item) => Number(item.id) > Number(restaurado.id));
    local.pedidos.splice(posicao < 0 ? local.pedidos.length : posicao, 0, restaurado);
    // Mesma ordem segura da manutenção: primeiro grava na lista, depois tira do arquivo
    salvarPedidos(local.pedidos);
    local.arquivados.splice(local.indice, 1);
    salvarArquivados(local.arquivados);
    return restaurado;
}

function respostaErroPedidos(res, error, mensagem) {
    if (error instanceof ErroArquivoPedidos) {
        return res.status(500).json({ error: mensagemArquivoPedidos(error) });
    }
    console.error(`${mensagem}:`, error);
    return res.status(500).json({ error: `${mensagem}. Tente novamente.` });
}

/* ================= Middlewares ================= */

// Primeiro as barreiras: Host local (DNS rebinding/CSRF) e cabeçalhos de segurança
app.use(exigirHostLocal);
app.use(cabecalhosSeguranca);
app.use(express.json());

const estaLogado = (req) => sessaoValida(req, lerLoja());

// Tela de entrada: quem já está logado vai direto para os pedidos
app.get(["/", "/index.html"], (req, res) => {
    if (estaLogado(req)) {
        return res.redirect(302, "/dashboard");
    }
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// As páginas internas só abrem pelas rotas protegidas abaixo, nunca direto pela pasta
app.use("/pages", (req, res) => res.status(404).type("text/plain").send("Não encontrado."));
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

// Rotas que funcionam mesmo sem loja cadastrada (necessárias para o cadastro)
const ROTAS_SEM_LOJA = ["/cadastro", "/cadastro/status", "/cep"];
// Rotas da API liberadas sem login
const ROTAS_PUBLICAS = ["/login", "/logout", "/cadastro", "/cadastro/status"];
const casaRota = (lista, caminho) => lista.some((rota) => caminho === rota || caminho.startsWith(`${rota}/`));

// Enquanto a loja não for cadastrada, o resto da API não funciona
app.use("/api", (req, res, next) => {
    if (!casaRota(ROTAS_SEM_LOJA, req.path) && !lojaCadastrada()) {
        return res.status(503).json({
            error: "Nenhuma loja cadastrada nesta instalação.",
        });
    }
    next();
});

// O resto da API exige login (a consulta de CEP também é liberada durante o primeiro cadastro)
app.use("/api", (req, res, next) => {
    const cepNoCadastro = casaRota(["/cep"], req.path) && !lojaCadastrada();
    if (casaRota(ROTAS_PUBLICAS, req.path) || cepNoCadastro || estaLogado(req)) {
        return next();
    }
    return res.status(401).json({ error: "Faça login para continuar." });
});

/* ================= Páginas ================= */

// Página interna: sem loja ou sem login, volta para a tela de entrada
function paginaProtegida(arquivo) {
    return (req, res) => {
        if (!lojaCadastrada() || !estaLogado(req)) {
            return res.redirect(302, "/");
        }
        res.sendFile(path.join(PASTA_PAGINAS, arquivo));
    };
}

app.get("/dashboard", paginaProtegida("dashboard.html"));
app.get("/novo-pedido", paginaProtegida("novo-pedido.html"));
app.get("/detalhes-pedido/:id", paginaProtegida("detalhes-pedido.html"));
app.get("/metricas", paginaProtegida("metricas.html"));

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
    const espera = segundosBloqueado();
    if (espera) {
        return respostaBloqueio(res, espera, `Muitas tentativas erradas. Tente de novo em ${textoEspera(espera)}.`);
    }
    if (!reservarLogin()) {
        return respostaBloqueio(res, 1, "Aguarde um instante e tente de novo.");
    }

    try {
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

        // Confere a senha mesmo com usuário errado (contra um hash fictício), para o tempo
        // de resposta não revelar se o usuário existe
        const senhaConfere = await verificarSenha(
            typeof pwd === "string" ? pwd : "",
            usuarioConfere ? loja.pwd : hashFicticio,
        );

        if (usuarioConfere && senhaConfere) {
            // Loja antiga com senha em texto puro: troca por hash no primeiro login
            if (!isHash(loja.pwd)) {
                salvarLoja({ ...loja, pwd: await hashSenha(pwd) });
                console.log("Senha da loja convertida para hash.");
            }
            registrarAcertoLogin();
            criarSessao(res, loja);
            console.log("Entrada bem sucedida!");
            return res.status(200).json({ ok: true });
        }

        registrarErroLogin();
        console.log("Alguma credencial está errada!");
        const bloqueio = segundosBloqueado();
        if (bloqueio) {
            return respostaBloqueio(res, bloqueio, `Usuário ou senha incorretos. Por segurança, aguarde ${textoEspera(bloqueio)} para tentar de novo.`);
        }
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
    } finally {
        liberarLogin();
    }
});

// Sair: encerra a sessão deste navegador
app.post("/api/logout", (req, res) => {
    encerrarSessao(req, res);
    res.json({ ok: true });
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
        // Um loja.json vazio ou inválido não é uma loja: guarda uma cópia (nunca apaga) e libera o cadastro
        if (fs.existsSync(CAMINHO_LOJA) && !lojaCadastrada()) {
            const copia = `${CAMINHO_LOJA}.invalido-${Date.now()}`;
            fs.renameSync(CAMINHO_LOJA, copia);
            console.warn(`loja.json inválido guardado em ${path.basename(copia)} antes do novo cadastro.`);
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

// Lista de pedidos (antes, aplica os prazos de arquivamento)
app.get("/api/pedidos", (req, res) => {
    manutencaoPedidos();
    res.json(lerPedidos().map((pedido) => comCiclo(pedido, false)));
});

// Pedidos guardados em finalizados.json (concluídos há mais de 30 dias sem troca nem mudança)
app.get("/api/pedidos/arquivados", (req, res) => {
    manutencaoPedidos();
    res.json(lerArquivados().map((pedido) => comCiclo(pedido, true)));
});

// Um pedido (da lista ou do arquivo)
app.get("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const local = localizarPedido(id);
    if (!local) {
        return res.status(404).json({ error: "O pedido não foi encontrado." });
    }
    const lista = local.arquivado ? local.arquivados : local.pedidos;
    res.json(comCiclo(lista[local.indice], local.arquivado));
});

// Criar pedido
app.post("/api/pedidos", (req, res) => {
    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    try {
        const pedidos = lerPedidos();
        // Ids dos arquivados continuam reservados (o pedido pode voltar para a lista)
        const novoId = proximoIdPedido([...lerArquivados(), ...pedidos]);
        if (novoId === null) {
            return res.status(409).json({
                error: `Limite de ${ID_MAXIMO} pedidos atingido. Exclua pedidos antigos para criar novos.`,
            });
        }
        const { data, hora } = momentoAtual();
        const pedidoCriado = { ...pedido, data, hora, id: novoId };
        // Já criado como venda concluída: a conclusão é agora
        if (isStatusConcluido(pedido.status)) {
            pedidoCriado.dataConclusao = data;
            pedidoCriado.horaConclusao = hora;
        }

        pedidos.push(pedidoCriado);
        salvarPedidos(pedidos);
        return res.status(201).json({ pedido: comCiclo(pedidoCriado, false) });
    } catch (error) {
        return respostaErroPedidos(res, error, "Ocorreu um erro ao salvar o pedido");
    }
});

// Editar pedido (conta como mudança: o prazo de 30 dias recomeça; se estava arquivado, volta para a lista)
app.put("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const { erro, pedido } = validarPedido(req.body);
    if (erro) {
        return res.status(400).json({ error: erro });
    }

    try {
        const local = localizarPedido(id);
        if (!local) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }

        // Mantém id, data, hora e trocas originais
        const anterior = (local.arquivado ? local.arquivados : local.pedidos)[local.indice];
        const pedidoAtualizado = { ...anterior, ...pedido, atualizadoEm: new Date().toISOString() };

        // Data de conclusão: grava ao passar para Finalizado/Despachado, mantém entre os dois
        // (Despachado -> Finalizado não muda a data) e apaga se voltar para um status pendente
        if (isStatusConcluido(pedido.status) && !isStatusConcluido(anterior.status)) {
            const { data, hora } = momentoAtual();
            pedidoAtualizado.dataConclusao = data;
            pedidoAtualizado.horaConclusao = hora;
        } else if (!isStatusConcluido(pedido.status)) {
            delete pedidoAtualizado.dataConclusao;
            delete pedidoAtualizado.horaConclusao;
        }

        const salvo = gravarPedidoAlterado(local, pedidoAtualizado);
        return res.status(200).json({ pedido: comCiclo(salvo, false), restaurado: local.arquivado });
    } catch (error) {
        return respostaErroPedidos(res, error, "Ocorreu um erro ao salvar o pedido");
    }
});

// Registrar troca de peça (o prazo de 30 dias recomeça; se estava arquivado, volta para a lista)
app.post("/api/pedidos/:id/trocas", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    const descricao = typeof req.body?.descricao === "string" ? req.body.descricao.trim() : "";
    if (!descricao || descricao.length > 300) {
        return res.status(400).json({ error: "Descreva a troca (até 300 caracteres)." });
    }

    try {
        const local = localizarPedido(id);
        if (!local) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }
        const anterior = (local.arquivado ? local.arquivados : local.pedidos)[local.indice];
        const trocas = Array.isArray(anterior.trocas) ? anterior.trocas : [];
        if (trocas.length >= 50) {
            return res.status(409).json({ error: "Este pedido já tem o máximo de 50 trocas registradas." });
        }
        const { data, hora } = momentoAtual();
        const troca = { em: new Date().toISOString(), data, hora, descricao };

        const salvo = gravarPedidoAlterado(local, { ...anterior, trocas: [...trocas, troca] });
        return res.status(201).json({ pedido: comCiclo(salvo, false), restaurado: local.arquivado });
    } catch (error) {
        return respostaErroPedidos(res, error, "Ocorreu um erro ao registrar a troca");
    }
});

// Excluir pedido (da lista ou do arquivo)
app.delete("/api/pedidos/:id", (req, res) => {
    const id = lerIdPedido(req, res);
    if (id === null) return;

    try {
        const local = localizarPedido(id);
        if (!local) {
            return res.status(404).json({ error: "O pedido não foi encontrado." });
        }
        if (local.arquivado) {
            local.arquivados.splice(local.indice, 1);
            salvarArquivados(local.arquivados);
        } else {
            local.pedidos.splice(local.indice, 1);
            salvarPedidos(local.pedidos);
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        return respostaErroPedidos(res, error, "Ocorreu um erro ao excluir o pedido");
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

// Confere os prazos de arquivamento ao iniciar e de hora em hora (também roda a cada listagem)
function manutencaoAgendada() {
    try {
        manutencaoPedidos();
    } catch (error) {
        console.error("Não foi possível verificar os prazos dos pedidos:", error.message);
    }
}
manutencaoAgendada();
setInterval(manutencaoAgendada, 60 * 60 * 1000).unref();
