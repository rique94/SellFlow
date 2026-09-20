const telefone = document.getElementById("f_telefone");
let pecas = document.getElementById("pecas");
let qtdPecas = document.getElementById("qtd_pecas");
let numQtdPecas = 1

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
    numQtdPecas += 1
    qtdPecas.innerHTML = numQtdPecas
    console.log("adicionando peças!");
    pecas.insertAdjacentHTML("beforeend", `<div class="f_linha">
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
                        </div>`);
}

function deletePeca() {
    numQtdPecas = 1;
    qtdPecas.innerHTML = "1"
    console.log("adicionando peças!");
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