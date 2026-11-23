/*
 * Lista de pedidos.
 * - Pedidos em andamento primeiro e concluídos (Finalizado/Despachado) no final, mais recentes antes.
 * - Cada cartão mostra se houve troca de peça e quando o pedido vai para o arquivo (regras em private/ciclo.js).
 * - O botão "Arquivados" mostra os pedidos guardados em finalizados.json.
 */

const STATUS_CLASSE = {
    "🔴Pagar": "status-pagar",
    "🟡Retirar": "status-retirar",
    "🟣Pagar local": "status-retirar-local",
    "✅Finalizado": "status-finalizado",
    "🔵Despachar": "status-despachar",
    "🟦Despachado": "status-despachado",
};

const linhaCard = document.getElementById("linhaCard");
const avisoArquivo = document.getElementById("aviso-arquivo");
const botaoArquivados = document.getElementById("filtro-arquivados");

let loja = null;
let pedidos = [];
let arquivados = null; // carregados só quando o botão "Arquivados" é usado
let modoArquivo = false;
let filtrosStatus = [];
let termoPesquisa = "";

/* ================= Utilitários ================= */

// Escapa texto antes de colocar dentro de innerHTML (evita XSS com nomes maliciosos)
function escapeHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[caractere]);
}

function normalizarTexto(texto) {
    return texto
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

const isConcluido = (pedido) => pedido.status === "✅Finalizado" || pedido.status === "🟦Despachado";
const contar = (...statuses) => pedidos.filter((pedido) => statuses.includes(pedido.status)).length;
const textoDias = (dias) => (dias <= 0 ? "hoje" : dias === 1 ? "em 1 dia" : `em ${dias} dias`);

// "22/11/2026" + "14:05" -> número para ordenar (0 se não tiver data)
function momentoDoPedido(pedido) {
    const [d, m, a] = String(pedido.data || "").split("/").map(Number);
    const [h, min] = String(pedido.hora || "00:00").split(":").map(Number);
    return d && m && a ? new Date(a, m - 1, d, h || 0, min || 0).getTime() : 0;
}

// Em andamento primeiro, concluídos no final; dentro de cada grupo, os mais recentes antes
function ordenar(lista) {
    return [...lista].sort(
        (a, b) =>
            isConcluido(a) - isConcluido(b) ||
            momentoDoPedido(b) - momentoDoPedido(a) ||
            Number(b.id) - Number(a.id),
    );
}

/* ================= Dados ================= */

async function lerJson(url) {
    const resposta = await fetch(url);
    const corpo = await resposta.json().catch(() => null);
    return { resposta, corpo };
}

async function pegarDados() {
    const [dadosLoja, dadosPedidos] = await Promise.all([lerJson("/api/loja"), lerJson("/api/pedidos")]);
    // Sem loja cadastrada: volta para a tela de entrada
    if (dadosLoja.resposta.status === 503) {
        window.location.replace("/");
        return false;
    }
    if (!dadosLoja.resposta.ok || !dadosPedidos.resposta.ok || !dadosLoja.corpo || !Array.isArray(dadosPedidos.corpo)) {
        throw new Error(dadosPedidos.corpo?.error || "Não foi possível carregar os pedidos.");
    }
    loja = dadosLoja.corpo;
    pedidos = dadosPedidos.corpo;
    return true;
}

async function pegarArquivados() {
    const { resposta, corpo } = await lerJson("/api/pedidos/arquivados");
    if (!resposta.ok || !Array.isArray(corpo)) {
        throw new Error(corpo?.error || "Não foi possível carregar os pedidos arquivados.");
    }
    arquivados = corpo;
}

/* ================= Tela ================= */

function mostrarContadores() {
    document.getElementById("nome_loja").textContent = loja.usrName;
    document.getElementById("num-total-pedidos").textContent = pedidos.length;
    document.getElementById("num-pedidos-retirar").textContent = contar("🟡Retirar", "🟣Pagar local");
    document.getElementById("num-pedidos-pagar").textContent = contar("🔴Pagar", "🟣Pagar local");
    document.getElementById("num-pedidos-finalizados").textContent = contar("✅Finalizado");
}

function atualizarBotoes() {
    const botao = document.getElementById("filtro-status");
    const rotulo =
        filtrosStatus.length === 1
            ? filtrosStatus[0]
            : filtrosStatus.length > 1
              ? "Status: múltiplos"
              : "Status: todos";
    botao.textContent = `${rotulo} ▾`;
    document.getElementById("opcoes-status").hidden = true;
    botao.setAttribute("aria-expanded", "false");

    [
        ["filtro-a-despachar", "🔵Despachar"],
        ["filtro-despachados", "🟦Despachado"],
    ].forEach(([idBotao, status]) => {
        const ativo = filtrosStatus.length === 1 && filtrosStatus[0] === status;
        const botaoRapido = document.getElementById(idBotao);
        botaoRapido.classList.toggle("ativo", ativo);
        botaoRapido.setAttribute("aria-pressed", String(ativo));
    });

    botaoArquivados.classList.toggle("ativo", modoArquivo);
    botaoArquivados.setAttribute("aria-pressed", String(modoArquivo));
    avisoArquivo.hidden = !modoArquivo;
}

// Linha do cartão sobre trocas e prazo de arquivamento (null quando não há nada a dizer)
function linhaCiclo(pedido) {
    const ciclo = pedido.ciclo || {};
    const qtdTrocas = ciclo.trocas || 0;
    const troca = qtdTrocas ? `🔁 ${qtdTrocas} troca${qtdTrocas > 1 ? "s" : ""}` : "Sem troca";

    if (ciclo.fase === "arquivado") {
        return {
            texto: `${troca} · apagado ${textoDias(ciclo.diasRestantes)}`,
            dica: "Guardado no arquivo de finalizados. Registrar uma troca ou editar devolve o pedido para a lista.",
            classe: "ciclo-arquivado",
        };
    }
    if (ciclo.fase === "concluido") {
        return {
            texto: `${troca} · arquiva ${textoDias(ciclo.diasRestantes)}`,
            dica: "Sem troca ou mudança em 30 dias, o pedido vai para o arquivo de finalizados.",
            classe: qtdTrocas ? "ciclo-troca" : "ciclo-normal",
        };
    }
    if (qtdTrocas) {
        return { texto: troca, dica: "Este pedido teve troca de peça.", classe: "ciclo-troca" };
    }
    return null;
}

function cartao(pedido) {
    const itens = pedido.listaPedidos || [];
    const primeiroNome = (pedido.cliente?.nome || "").split(" ")[0];
    const telefone = pedido.cliente?.telefone || "";
    const qtdPecas = itens.reduce((total, item) => total + Number(item.qtd_peca), 0);
    const valorTotal =
        itens.reduce((total, item) => total + Number(item.qtd_peca) * Number(item.valor_peca), 0) +
        (Number(pedido.frete) || 0);
    const ciclo = linhaCiclo(pedido);

    return `<div class="cards${modoArquivo ? " cards-arquivado" : ""}">
            <div class="cards-content">
                <div class="card-linha-1">
                    <h3 class="num-pedido"># ${escapeHtml(pedido.id)}</h3>
                    <p class="data-hora-pedido"><span class="data-pedido">${escapeHtml(pedido.data)}</span> ● <span class="hora-pedido">${escapeHtml(pedido.hora)}</span></p>
                </div>
                <div class="card-linha-2">
                    <div class="dados-pessoais-pedido">
                        <h3 class="nome-pedido">${escapeHtml(primeiroNome)}</h3>
                        <p class="telefone-pedido">${escapeHtml(telefone)}</p>
                    </div>
                    <p class="${STATUS_CLASSE[pedido.status] || ""}">${escapeHtml(pedido.status)}</p>
                </div>
                <div class="card-linha-3">
                    <p class="qtd-produtos">${qtdPecas} produto(s)</p>
                    <p class="valor-pedido">R$ ${valorTotal.toFixed(2).replace(".", ",")}</p>
                </div>
                ${ciclo ? `<p class="card-ciclo ${ciclo.classe}" title="${escapeHtml(ciclo.dica)}">${escapeHtml(ciclo.texto)}</p>` : ""}
            </div>
            <div class="card-content-detalhes">
                <a href="/detalhes-pedido/${encodeURIComponent(pedido.id)}" class="ver-detalhes-a">Ver detalhes ➡️</a>
            </div>
        </div>`;
}

function renderizarPedidos() {
    const query = termoPesquisa.trim();
    const queryNome = normalizarTexto(query);
    const queryTelefone = query.replace(/\D/g, "");
    const fonte = modoArquivo ? arquivados || [] : pedidos;

    const filtrados = fonte.filter((pedido) => {
        if (filtrosStatus.length && !filtrosStatus.includes(pedido.status)) {
            return false;
        }
        if (!query) {
            return true;
        }
        const nome = normalizarTexto(pedido.cliente?.nome || "");
        const telefone = String(pedido.cliente?.telefone || "").replace(/\D/g, "");
        return nome.includes(queryNome) || (queryTelefone.length > 0 && telefone.includes(queryTelefone));
    });

    if (filtrados.length === 0) {
        linhaCard.innerHTML = modoArquivo && !query && !filtrosStatus.length
            ? "<p>Nenhum pedido no arquivo de finalizados.</p>"
            : "<p>Nenhum pedido encontrado.</p>";
        return;
    }
    linhaCard.innerHTML = ordenar(filtrados).map(cartao).join("");
}

function filtrarPedidos(...statuses) {
    filtrosStatus = statuses.filter(Boolean);
    atualizarBotoes();
    renderizarPedidos();
}

// Volta para a lista completa (sem filtros e fora do arquivo)
function mostrarTodos() {
    modoArquivo = false;
    filtrarPedidos();
}

async function alternarArquivados() {
    if (modoArquivo) {
        mostrarTodos();
        return;
    }
    botaoArquivados.disabled = true;
    try {
        await pegarArquivados(); // sempre recarrega: os prazos mudam com o tempo
        modoArquivo = true;
        filtrarPedidos();
    } catch (error) {
        linhaCard.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    } finally {
        botaoArquivados.disabled = false;
    }
}

function alternarFiltroRapido(status) {
    modoArquivo = false;
    if (filtrosStatus.length === 1 && filtrosStatus[0] === status) {
        filtrarPedidos();
    } else {
        filtrarPedidos(status);
    }
}

function alternarMenuStatus() {
    const botao = document.getElementById("filtro-status");
    const opcoes = document.getElementById("opcoes-status");
    opcoes.hidden = !opcoes.hidden;
    botao.setAttribute("aria-expanded", String(!opcoes.hidden));
}

/* ================= Eventos ================= */

// Cliques dos cartões e filtros (atributos data-* no HTML; a CSP não permite onclick inline)
document.addEventListener("click", (event) => {
    const alvo = event.target.closest("[data-filtro], [data-filtro-rapido], [data-acao]");
    if (!alvo || !loja) {
        return;
    }
    const acao = alvo.dataset.acao;
    if (acao === "mostrar-todos") {
        mostrarTodos();
    } else if (acao === "menu-status") {
        alternarMenuStatus();
    } else if (acao === "arquivados") {
        alternarArquivados();
    } else if (alvo.dataset.filtroRapido !== undefined) {
        alternarFiltroRapido(alvo.dataset.filtroRapido);
    } else {
        // Cartões do topo contam a lista ativa: saem do arquivo. O menu de status filtra a tela atual.
        if (alvo.classList.contains("cards-dashboard")) {
            modoArquivo = false;
        }
        filtrarPedidos(...alvo.dataset.filtro.split("|"));
    }
});

document.getElementById("pesquisa-pedidos").addEventListener("input", (event) => {
    termoPesquisa = event.target.value;
    renderizarPedidos();
});

(async function iniciar() {
    try {
        if (!(await pegarDados())) {
            return;
        }
    } catch (error) {
        linhaCard.innerHTML = `<p>${escapeHtml(
            error instanceof TypeError
                ? "Não foi possível carregar os pedidos. Verifique se o servidor está rodando."
                : error.message,
        )}</p>`;
        return;
    }
    mostrarContadores();
    mostrarTodos();
})();
