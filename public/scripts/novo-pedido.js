const telefone = document.getElementById("f_telefone");
let pecas = document.getElementById("pecas");
let qtdPecas = document.getElementById("qtd_pecas");
let numQtdPecas = 1;
let listaPedidos = [];

const id = window.location.pathname.split("/").pop();

let links = document.querySelectorAll(
    'a[href="http://localhost:3000/dashboard"]',
);
links.forEach((link) => {
    link.href = `http://localhost:3000/dashboard/${id}`;
});

async function pegarDados() {
    let nomeLoja = document.getElementById("nome_loja");

    const response = await fetch(`http://localhost:3000/api/takeData/${id}`);

    const data = await response.json();

    console.log(data);

    nomeLoja.innerHTML = data.usr.usrName;

    return data;
}
const user = pegarDados();

telefone.addEventListener("input", function () {
    let valor = telefone.value.replace(/\D/g, "");

    if (valor.length > 11) {
        valor = valor.substring(0, 11);
    }

    if (valor.length > 6) {
        valor = valor.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    } else if (valor.length > 2) {
        valor = valor.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    } else if (valor.length > 0) {
        valor = valor.replace(/^(\d{0,2})/, "($1");
    }

    telefone.value = valor;
});

function addPeca() {
    numQtdPecas += 1;
    qtdPecas.innerHTML = numQtdPecas;
    console.log("adicionando peças!");
    pecas.insertAdjacentHTML(
        "beforeend",
        `<div class="f_linha">
                            <div class="f_input">
                                <label for="f_peca${numQtdPecas}">Peça: </label>
                                <input
                                    type="text"
                                    name="peca"
                                    id="f_peca${numQtdPecas}"
                                    placeholder="Descrição da peça"
                                />

                                <label for="f_qtd_peca${numQtdPecas}">Quantidade: </label>
                                <input
                                    type="number"
                                    name="qtd_peca"
                                    id="f_qtd_peca${numQtdPecas}"
                                />

                                <label for="f_valor${numQtdPecas}">Valor da peça R$: </label>
                                <input
                                    type="number"
                                    name="valor_peca"
                                    id="f_valor${numQtdPecas}"
                                    placeholder="com ponto"
                                />
                            </div>
                        </div>`,
    );
}

function deletePeca() {
    numQtdPecas = 1;
    qtdPecas.innerHTML = "1";
    console.log("removendo peças!");
    pecas.innerHTML = ``;
    pecas.innerHTML = `<div class="f_linha">
                            <div class="f_input">
                                <label for="f_peca${numQtdPecas}">Peça: </label>
                                <input
                                    type="text"
                                    name="peca"
                                    id="f_peca${numQtdPecas}"
                                    placeholder="Descrição da peça"
                                />

                                <label for="f_qtd_peca${numQtdPecas}">Quantidade: </label>
                                <input
                                    type="number"
                                    name="qtd_peca"
                                    id="f_qtd_peca${numQtdPecas}"
                                />

                                <label for="f_valor${numQtdPecas}">Valor da peça R$: </label>
                                <input
                                    type="number"
                                    name="valor_peca"
                                    id="f_valor${numQtdPecas}"
                                    placeholder="com ponto"
                                />
                            </div>
                        </div>`;
}

// fazendo o novo pedido

async function enviarDados() {
    //verificando os dados
    if (verifyValuesClient()) {
        //pegando os dados do cliente
        const nomeCli = document.getElementById("f_nome").value;
        const telCli = document.getElementById("f_telefone").value;
        const enderecoCli = document.getElementById("f_endereco").value;
        const cepCli = document.getElementById("f_cep").value;
        const complementoCli = document.getElementById("f_complemento").value;

        //fazendo o objeto cliente
        const cliente = {
            nome: nomeCli,
            telefone: telCli,
            endereco: enderecoCli,
            cep: cepCli,
            complemento: complementoCli,
        };

        if (verifyValuesOrder()) {
            //pegando os dados do pedido
            for (let i = 1; i <= numQtdPecas; i++) {
                let descPeca = document.getElementById(`f_peca${i}`).value;
                let qtdPeca = document.getElementById(`f_qtd_peca${i}`).value;
                let valorPeca = document.getElementById(`f_valor${i}`).value;

                //fazendo o objeto peça para o objeto pedido
                const peca = {
                    desc_peca: descPeca,
                    qtd_peca: qtdPeca,
                    valor_peca: valorPeca,
                };
                //colocando na lista da peça
                listaPedidos.push(peca);
            }

            //fazendo o objeto pedido
            const pedido = {
                cliente,
                listaPedidos,
                loja: id
            };

            console.log(pedido)
            //enviando pro servidor via fetch
            const response = await fetch("http://localhost:3000/api/enviar-pedido", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(pedido)
            });
            console.log(response)
        } else {
            return;
        }
    } else {
        return;
    }
}

function verifyValuesClient() {
    //pegando os dados do cliente
    const nomeCli = document.getElementById("f_nome");
    const telCli = document.getElementById("f_telefone");

    if (nomeCli.value == "") {
        nomeCli.className = "alerta";
        window.alert("Falta o nome do Cliente!!!");
        return false;
    } else if (telCli.value == "") {
        telCli.className = "alerta";
        window.alert("Falta o telefone do Cliente!!!");
        return false;
    } else {
        nomeCli.className = "";
        telCli.className = "";
        return true;
    }
}
function verifyValuesOrder() {
    for (let i = 1; i <= numQtdPecas; i++) {
        let descPeca = document.getElementById(`f_peca${i}`);
        let qtdPeca = document.getElementById(`f_qtd_peca${i}`);
        let valorPeca = document.getElementById(`f_valor${i}`);

        if (descPeca.value == "") {
            descPeca.className = "alerta";
            window.alert(
                "Faltou a descrição de uma Peça!!!\nJá verifique os outros dados para não receber outro alerta.",
            );
            return false;
        }
        if (qtdPeca.value == "") {
            descPeca.className = "alerta";
            window.alert(
                "Faltou a quantidade de uma Peça!!!\nJá verifique os outros dados para não receber outro alerta.",
            );
            return false;
        }
        if (valorPeca.value == "") {
            descPeca.className = "alerta";
            window.alert(
                "Faltou o valor de uma Peça!!!\nJá verifique os outros dados para não receber outro alerta.",
            );
            return false;
        } else {
            valorPeca.className = "";
            descPeca.className = "";
            qtdPeca.className = "";

            return true;
        }
    }
}
