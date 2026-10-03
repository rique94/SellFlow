const telefone = document.getElementById("f_telefone");
let pecas = document.getElementById("pecas");
let qtdPecas = document.getElementById("qtd_pecas");
let numQtdPecas = 1;
let valorTotal = 0.0;

let mensagem = document.getElementById("footer");
let mensagem1 = document.getElementById("mensagem1");

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

    if (response.ok) {
        nomeLoja.innerHTML = data.usr.usrName;
    }

    return data;
}
const user = pegarDados();

//funçoes
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

    calcularValorTotal();
}

function deletePeca() {
    if (numQtdPecas <= 1) {
        return;
    }

    // Pega a última peça
    const ultimaPeca = pecas.lastElementChild;

    // Remove somente a última peça
    ultimaPeca.remove();

    // Diminui a quantidade
    numQtdPecas -= 1;
    qtdPecas.innerHTML = numQtdPecas;

    // Recalcula o valor total
    calcularValorTotal();

    console.log("peça removida!");
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
            let listaPedidos = [];
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

            //verificando o status do pedido
            if (verifyValuesStatus()) {
                calcularValorTotal()

                const status = document.getElementById("f_status").value;

                //pegando data e hora
                const data = new Date().toLocaleDateString("pt-BR");
                const hora = new Date().toLocaleTimeString("pt-BR",  {
                    hour: "2-digit",
                    minute: "2-digit"
                });

                //fazendo o objeto pedido
                const pedido = {
                    cliente,
                    listaPedidos,
                    qtdPecas: numQtdPecas,
                    status: status,
                    valorTotal: valorTotal,
                    loja: id,
                    data: data,
                    hora: hora
                };

                //enviando pro servidor via fetch e fazendo try/catch

                try {
                    const response = await fetch(
                        "http://localhost:3000/api/enviar-pedido",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(pedido),
                        },
                    );
                    if (response.status == 200) {
                        mensagem.innerHTML = "Pedido enviado com sucesso!";
                        mensagem.className = "sucesso";
                        mensagem1.innerHTML = "Pedido criado!!!"
                        mensagem1.className = "sucesso1";
                    }
                } catch (err) {
                    mensagem.innerHTML = "Erro ao enviar o pedido!";
                    mensagem.className = "erro";
                }
            } else {
                return;
            }
        } else {
            return;
        }
    } else {
        return;
    }
}

function verifyValuesStatus() {
    const status = document.getElementById("f_status").value;

    if (status == "") {
        return false;
    } else {
        return true;
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
            qtdPeca.className = "alerta";
            window.alert(
                "Faltou a quantidade de uma Peça!!!\nJá verifique os outros dados para não receber outro alerta.",
            );
            return false;
        }
        if (valorPeca.value == "") {
            valorPeca.className = "alerta";
            window.alert(
                "Faltou o valor de uma Peça!!!\nJá verifique os outros dados para não receber outro alerta.",
            );
            return false;
        }

        valorPeca.className = "";
        descPeca.className = "";
        qtdPeca.className = "";
    }
    return true;
}
function calcularValorTotal() {
    valorTotal = 0;

    for (let i = 1; i <= numQtdPecas; i++) {
        const qtdPeca =
            Number(document.getElementById(`f_qtd_peca${i}`).value) || 0;

        const valorPeca =
            Number(document.getElementById(`f_valor${i}`).value) || 0;

        valorTotal += qtdPeca * valorPeca;
    }

    document.getElementById("valor_total").innerHTML = valorTotal
        .toFixed(2)
        .replace(".", ",");
}

//eventListeners
pecas.addEventListener("input", function (event) {
    if (
        event.target.name === "qtd_peca" ||
        event.target.name === "valor_peca"
    ) {
        calcularValorTotal();
    }
});

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
