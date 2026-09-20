const telefone = document.getElementById("f_telefone");
let pecas = document.getElementById("pecas");
let qtdPecas = Number(document.getElementById("qtd_pecas"));

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
    qtdPecas.innerText++
    console.log("adicionando peças!");
    pecas.innerHTML += `<div class="f_linha">
                            <div class="f_input">
                                <label for="f_peca">Peça: </label>
                                <input
                                    type="text"
                                    name="peca"
                                    id="f_peca"
                                    placeholder="Descrição da peça"
                                />

                                <label for="f_qtd_peca">Quantidade: </label>
                                <input
                                    type="number"
                                    name="qtd_peca"
                                    id="f_qtd_peca"
                                />

                                <label for="f_valor">Valor da peça R$: </label>
                                <input
                                    type="number"
                                    name="valor_peca"
                                    id="f_valor"
                                    placeholder="com ponto"
                                />
                            </div>
                        </div>`;
}