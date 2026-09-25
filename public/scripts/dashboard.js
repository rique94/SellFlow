//tudo isso aqui vai executar assim que entrar na página
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

        linhaCard.innerHTML += `<div class="cards">
                    <div class="cards-content">
                        <div class="card-linha-1">
                            <h3 class="num-pedido">#001</h3>
                            <p class="data-hora-pedido"><span class="data-pedido">29/08/2026</span> ● <span class="hora-pedido">16:30</span></p>
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
}
pegarDados();
