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

async function pegarDados() {
    let nomeLoja = document.getElementById("nome_loja");
    let linhaCard = document.getElementById("linhaCard");

    const response = await fetch(`http://localhost:3000/api/takeData/${id}`);

    const data = await response.json();

    console.log(data);

    nomeLoja.innerHTML = data.usr.usrName;

    if (data.pedidos.length === 0) {
        linhaCard.innerHTML = "<p>Nenhum Pedido encontrado</p>";
        return;
    }
    //pegando os pedidos
    linhaCard.innerHTML = "";
    for (let i = 0; i < data.pedidos.length; i++) {
        const pedido = data.pedidos[i];
        const itens = pedido.listaPedidos || [];

        //pegando os dados e formatando eles
        const firstNomeCli = pedido.cliente.nome.split(" ");
        const telCli = pedido.cliente.telefone;
        const status = pedido.status;
        const qtdPecas = itens.reduce(
            (total, item) => total + Number(item.qtd_peca),
            0,
        );
        const valorTotal = itens.reduce(
            (total, item) =>
                total + Number(item.qtd_peca) * Number(item.valor_peca),
            0,
        );
        const dia = pedido.data;
        const hora = pedido.hora;
        const idPedido = pedido.id;

        linhaCard.innerHTML += `<div class="cards">
                    <div class="cards-content">
                        <div class="card-linha-1">
                            <h3 class="num-pedido"># ${idPedido}</h3>
                            <p class="data-hora-pedido"><span class="data-pedido">${dia}</span> ● <span class="hora-pedido">${hora}</span></p>
                        </div>
                        <div class="card-linha-2" >
                            <div class="dados-pessoais-pedido">
                                <h3 class="nome-pedido">${firstNomeCli[0]}</h3>
                                <p class="telefone-pedido">${telCli}</p>
                            </div>
                            <p class="status-pedido">${status}</p>
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
    }

    //mostrando os numeros totais
    //pedidos totais
    totalPedidos.innerHTML = data.pedidos.length;

    //pedidos a retirar
    let qtdPedidosRetirar = 0;
    data.pedidos.forEach(pedido => {
        if (pedido.status == "🟡Retirar" || pedido.status == "🟣Pagar local") {
            qtdPedidosRetirar += 1;
        }
    });
    retirarPedidos.innerHTML = qtdPedidosRetirar;

    //pedidos a pagar
    let qtdPedidosPagar = 0;
    data.pedidos.forEach(pedido => {
        if (pedido.status == "🟣Pagar local" || pedido.status == "🔴Pagar") {
            qtdPedidosPagar += 1;
        }
    });
    pagarPedidos.innerHTML = qtdPedidosPagar;

    //pedidos finalizados
    let qtdPedidosFinalizados = 0;
    data.pedidos.forEach(pedido => {
        if (pedido.status == "🟢Finalizado") {
            qtdPedidosFinalizados += 1;
        }
    });
    finalizadoPedidos.innerHTML = qtdPedidosFinalizados;
}
pegarDados();
