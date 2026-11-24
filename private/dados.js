/*
 * Lojas e pedidos no banco de dados.
 * Cada loja só enxerga os próprios pedidos: toda consulta de pedido filtra por loja_id.
 */
const { consulta, transacao } = require("./banco");
const { verificarPrazos } = require("./ciclo");

const paraIso = (valor) => (valor ? new Date(valor).toISOString() : null);

/* ================= Lojas ================= */

// Linha do banco -> objeto no formato que as telas já usam (usrName, tel, address...)
function lojaDoBanco(linha) {
    if (!linha) return null;
    return {
        ...linha.dados,
        id: linha.id,
        login: linha.login,
        usrName: linha.nome,
        tel: linha.tel,
        pwd: linha.pwd,
        criadoEm: paraIso(linha.criado_em),
    };
}

// Dados da loja que podem ir para o navegador (nunca a senha nem o id interno)
function lojaPublica(loja) {
    const { pwd, id, ...dados } = loja;
    return dados;
}

async function buscarLojaPorId(id) {
    const [linha] = await consulta("SELECT * FROM lojas WHERE id = $1", [id]);
    return lojaDoBanco(linha);
}

/**
 * Loja pelo que foi digitado no login: o usuário (sem diferenciar maiúsculas) ou o telefone
 * (com ou sem máscara). O usuário nunca é só números, então os dois casos não se confundem.
 */
async function buscarLojaParaLogin(digitado, somenteDigitos) {
    const texto = String(digitado || "").trim();
    if (!texto) return null;
    if (/^[\d\s()+.-]+$/.test(texto)) {
        const telefone = somenteDigitos(texto);
        if (telefone.length < 10) return null;
        const [linha] = await consulta("SELECT * FROM lojas WHERE tel = $1", [telefone]);
        return lojaDoBanco(linha);
    }
    const [linha] = await consulta("SELECT * FROM lojas WHERE lower(login) = lower($1)", [texto]);
    return lojaDoBanco(linha);
}

/**
 * Cria a loja. Retorna { loja } ou { conflito: "login" | "telefone" } se já houver outra loja
 * com o mesmo usuário ou telefone (o banco garante isso mesmo com dois cadastros ao mesmo tempo).
 */
async function criarLoja(loja) {
    const { login, usrName, tel, pwd, criadoEm, ...dados } = loja;
    try {
        const [linha] = await consulta(
            `INSERT INTO lojas (login, tel, pwd, nome, dados) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
            [login, tel, pwd, usrName, JSON.stringify(dados)],
        );
        return { loja: lojaDoBanco(linha) };
    } catch (error) {
        if (error.code === "23505") {
            return { conflito: String(error.constraint || error.message).includes("tel") ? "telefone" : "login" };
        }
        throw error;
    }
}

/* ================= Pedidos ================= */

// O id do pedido é o número dele dentro da loja (1 a 999); arquivadoEm só existe nos finalizados
function pedidoDoBanco(linha) {
    const pedido = { ...linha.dados, id: linha.numero };
    if (linha.arquivado_em) {
        pedido.arquivadoEm = paraIso(linha.arquivado_em);
    }
    return pedido;
}

function dadosDoPedido(pedido) {
    const { id, arquivadoEm, ciclo, ...dados } = pedido;
    return JSON.stringify(dados);
}

class ErroLojaInexistente extends Error {}

/**
 * Abre uma transação com os pedidos da loja, já com os prazos de arquivamento aplicados.
 * A linha da loja fica travada até o fim, então duas ações da mesma loja ao mesmo tempo
 * acontecem uma depois da outra (sem número de pedido repetido nem gravação perdida).
 *
 * funcao recebe { pedidos, arquivados, todos, inserir, salvar, excluir }:
 * - pedidos / arquivados: listas na ordem de criação; todos: as duas juntas;
 * - salvar(pedido): grava o pedido; com arquivadoEm ele fica nos finalizados, sem ele volta para a lista.
 */
async function naLoja(lojaId, funcao, agora = new Date()) {
    return transacao(async (tx) => {
        const trava = await tx.consulta("SELECT id FROM lojas WHERE id = $1 FOR UPDATE", [lojaId]);
        if (trava.length === 0) {
            throw new ErroLojaInexistente("A loja não existe mais.");
        }

        const linhas = await tx.consulta(
            "SELECT numero, dados, arquivado_em FROM pedidos WHERE loja_id = $1 ORDER BY criado_em, numero",
            [lojaId],
        );

        const operacoes = {
            inserir: (pedido) =>
                tx.consulta("INSERT INTO pedidos (loja_id, numero, dados) VALUES ($1, $2, $3::jsonb)", [
                    lojaId,
                    pedido.id,
                    dadosDoPedido(pedido),
                ]),
            salvar: (pedido) =>
                tx.consulta(
                    "UPDATE pedidos SET dados = $3::jsonb, arquivado_em = $4 WHERE loja_id = $1 AND numero = $2",
                    [lojaId, pedido.id, dadosDoPedido(pedido), pedido.arquivadoEm || null],
                ),
            excluir: (id) => tx.consulta("DELETE FROM pedidos WHERE loja_id = $1 AND numero = $2", [lojaId, id]),
        };

        const todos = await aplicarPrazos(linhas.map(pedidoDoBanco), operacoes, lojaId, agora);
        return funcao({
            ...operacoes,
            todos,
            pedidos: todos.filter((pedido) => !pedido.arquivadoEm),
            arquivados: todos.filter((pedido) => pedido.arquivadoEm),
        });
    });
}

// Arquiva os concluídos parados há 30 dias e apaga os que estão nos finalizados há 30 dias
async function aplicarPrazos(todos, operacoes, lojaId, agora) {
    const pedidos = todos.filter((pedido) => !pedido.arquivadoEm);
    const arquivados = todos.filter((pedido) => pedido.arquivadoEm);
    const resultado = verificarPrazos(pedidos, arquivados, agora);
    if (!resultado.mudou) {
        return todos;
    }

    const jaArquivados = new Set(arquivados.map((pedido) => pedido.id));
    const continuam = new Map(resultado.arquivados.map((pedido) => [pedido.id, pedido]));

    for (const pedido of arquivados) {
        if (!continuam.has(pedido.id)) {
            await operacoes.excluir(pedido.id);
        }
    }
    for (const pedido of resultado.arquivados) {
        if (!jaArquivados.has(pedido.id)) {
            await operacoes.salvar(pedido);
        }
    }
    if (resultado.arquivadosAgora || resultado.apagados) {
        console.log(
            `Loja ${lojaId}: ${resultado.arquivadosAgora} pedido(s) arquivado(s), ${resultado.apagados} apagado(s) dos finalizados.`,
        );
    }

    return todos
        .filter((pedido) => !pedido.arquivadoEm || continuam.has(pedido.id))
        .map((pedido) => continuam.get(pedido.id) || pedido);
}

// Roda os prazos de todas as lojas (de hora em hora)
async function manutencaoGeral() {
    const lojas = await consulta("SELECT id FROM lojas ORDER BY id");
    for (const { id } of lojas) {
        try {
            await naLoja(id, () => {});
        } catch (error) {
            console.error(`Não foi possível verificar os prazos da loja ${id}:`, error.message);
        }
    }
}

module.exports = {
    lojaPublica,
    buscarLojaPorId,
    buscarLojaParaLogin,
    criarLoja,
    naLoja,
    manutencaoGeral,
    ErroLojaInexistente,
};
