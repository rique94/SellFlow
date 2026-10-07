//tudo isso aqui vai executar assim que entrar na página
//pegando o numero de pedidos totaise etc
let totalPedidos = document.getElementById("num-total-pedidos");
let retirarPedidos = document.getElementById("num-pedidos-retirar");
let pagarPedidos = document.getElementById("num-pedidos-pagar");
let finalizadoPedidos = document.getElementById("num-pedidos-finalizados");
//pegando o id da loja
const id = window.location.pathname.split("/").pop();

let links = document.querySelectorAll(
    'a[href="http://localhost:3000/novo-pedido"]',
);
links.forEach((link) => {
    link.href = `http://localhost:3000/novo-pedido/${id}`;
});

//dados e pedidos
let data;
let pedidos;
let filtrosStatus = [];
let termoPesquisa = "";

iniciar();

async function iniciar() {
    await pegarDados();
    mostrarDados();
}

async function pegarDados() {
    const response = await fetch(`http://localhost:3000/api/takeData/${id}`);
    data = await response.json();
    pedidos = data.pedidos;
}

function mostrarDados() {
    let nomeLoja = document.getElementById("nome_loja");

    //console.log(data);

    nomeLoja.innerHTML = data.usr.usrName;

    //mostrando os numeros totais
    //pedidos totais
    totalPedidos.innerHTML = data.pedidos.length;

    //pedidos a retirar
    let qtdPedidosRetirar = 0;
    data.pedidos.forEach((pedido) => {
        if (pedido.status == "🟡Retirar" || pedido.status == "🟣Pagar local") {
            qtdPedidosRetirar += 1;
        }
    });
    retirarPedidos.innerHTML = qtdPedidosRetirar;

    //pedidos a pagar
    let qtdPedidosPagar = 0;
    data.pedidos.forEach((pedido) => {
        if (pedido.status == "🟣Pagar local" || pedido.status == "🔴Pagar") {
            qtdPedidosPagar += 1;
        }
    });
    pagarPedidos.innerHTML = qtdPedidosPagar;

    //pedidos finalizados
    let qtdPedidosFinalizados = 0;
    data.pedidos.forEach((pedido) => {
        if (pedido.status == "✅Finalizado") {
            qtdPedidosFinalizados += 1;
        }
    });
    finalizadoPedidos.innerHTML = qtdPedidosFinalizados;

    filtrosStatus = [];
    atualizarBotaoFiltroStatus();
    atualizarBotoesFiltroRapido();
    renderizarPedidos();
}

function verifyStatus(pedido) {
    if (pedido.status == "✅Finalizado") {
        return "status-finalizado";
    }
    if (pedido.status == "🟣Pagar local") {
        return "status-retirar-local";
    }
    if (pedido.status == "🟡Retirar") {
        return "status-retirar";
    }
    if (pedido.status == "🔴Pagar") {
        return "status-pagar";
    }
    if (pedido.status == "🔵Despachar") {
        return "status-despachar";
    }
    if (pedido.status == "🟦Despachado") {
        return "status-despachado";
    }
}

function filtrarPedidos(...statuses) {
    filtrosStatus = statuses.filter(Boolean);
    atualizarBotaoFiltroStatus();
    atualizarBotoesFiltroRapido();
    renderizarPedidos();
}

function alternarMenuStatus() {
    const botao = document.getElementById("filtro-status");
    const opcoes = document.getElementById("opcoes-status");
    opcoes.hidden = !opcoes.hidden;
    botao.setAttribute("aria-expanded", String(!opcoes.hidden));
}

function atualizarBotaoFiltroStatus() {
    const botao = document.getElementById("filtro-status");
    const opcoes = document.getElementById("opcoes-status");
    const rotulos = {
        "🔴Pagar": "🔴 Pagar",
        "🟡Retirar": "🟡 Retirar (pago)",
        "🟣Pagar local": "🟣 Pagar local",
        "✅Finalizado": "✅ Finalizado",
        "🔵Despachar": "🔵 A despachar",
        "🟦Despachado": "🟦 Despachado",
    };
    const rotulo =
        filtrosStatus.length === 1
            ? rotulos[filtrosStatus[0]]
            : filtrosStatus.length > 1
              ? "Status: múltiplos"
              : "Status: todos";

    botao.textContent = `${rotulo} ▾`;
    opcoes.hidden = true;
    botao.setAttribute("aria-expanded", "false");
}

function alternarFiltroRapido(status) {
    if (filtrosStatus.length === 1 && filtrosStatus[0] === status) {
        filtrarPedidos();
        return;
    }

    filtrarPedidos(status);
}

function atualizarBotoesFiltroRapido() {
    const botoes = [
        ["filtro-a-despachar", "🔵Despachar"],
        ["filtro-despachados", "🟦Despachado"],
    ];

    botoes.forEach(([idBotao, status]) => {
        const botao = document.getElementById(idBotao);
        const ativo = filtrosStatus.length === 1 && filtrosStatus[0] === status;
        botao.classList.toggle("ativo", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

function normalizarTexto(texto) {
    return texto
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function renderizarPedidos() {
    const linhaCard = document.getElementById("linhaCard");
    const query = termoPesquisa.trim();
    const queryNome = normalizarTexto(query);
    const queryTelefone = query.replace(/\D/g, "");
    const pedidosFiltrados = (data.pedidos || []).filter((pedido) => {
        if (filtrosStatus.length && !filtrosStatus.includes(pedido.status)) {
            return false;
        }

        if (!query) {
            return true;
        }

        const nome = normalizarTexto(pedido.cliente?.nome || "");
        const telefone = String(pedido.cliente?.telefone || "").replace(
            /\D/g,
            "",
        );
        const nomeCorresponde = nome.includes(queryNome);
        const telefoneCorresponde =
            queryTelefone.length > 0 && telefone.includes(queryTelefone);

        return nomeCorresponde || telefoneCorresponde;
    });

    if (pedidosFiltrados.length === 0) {
        linhaCard.innerHTML = "<p>Nenhum Pedido encontrado</p>";
        return;
    }

    linhaCard.innerHTML = pedidosFiltrados
        .map((pedido) => {
            const itens = pedido.listaPedidos || [];
            const nomeCliente = pedido.cliente?.nome || "";
            const primeiroNome = nomeCliente.split(" ")[0];
            const telefone = pedido.cliente?.telefone || "";
            const qtdPecas = itens.reduce(
                (total, item) => total + Number(item.qtd_peca),
                0,
            );
            const valorTotal = itens.reduce(
                (total, item) =>
                    total + Number(item.qtd_peca) * Number(item.valor_peca),
                0,
            );
            const classStatus = verifyStatus(pedido);

            return `<div class="cards">
                    <div class="cards-content">
                        <div class="card-linha-1">
                            <h3 class="num-pedido"># ${pedido.id}</h3>
                            <p class="data-hora-pedido"><span class="data-pedido">${pedido.data}</span> ● <span class="hora-pedido">${pedido.hora}</span></p>
                        </div>
                        <div class="card-linha-2" >
                            <div class="dados-pessoais-pedido">
                                <h3 class="nome-pedido">${primeiroNome}</h3>
                                <p class="telefone-pedido">${telefone}</p>
                            </div>
                            <p class="${classStatus}">${pedido.status}</p>
                        </div>
                        <div class="card-linha-3">
                            <p class="qtd-produtos">${qtdPecas} produto(s)</p>
                            <p class="valor-pedido">R$ ${valorTotal.toFixed(2).replace(".", ",")}</p>
                        </div>
                    </div>
                    <div class="card-content-detalhes">
                        <a href="#" class="ver-detalhes-a">Ver detalhes ➡️</a>
                    </div>
                </div>`;
        })
        .join("");
}

document.getElementById("pesquisa-pedidos").addEventListener("input", (event) => {
    termoPesquisa = event.target.value;
    renderizarPedidos();
});
