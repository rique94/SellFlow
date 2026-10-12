const orderForm = document.getElementById("form-novo-pedido");
const itemsContainer = document.getElementById("pecas");
const orderStatus = document.getElementById("f_status");
const shippingContainer = document.getElementById("shipping-field");
const shippingInput = document.getElementById("f_frete");
const feedback = document.getElementById("footer");
const saveButton = document.querySelector(".main-header-actions button");
const storeId = window.location.pathname.split("/").filter(Boolean).pop();

let itemCount = itemsContainer.querySelectorAll("[data-product-row]").length;

function isShippingStatus(status) {
    return status === "🔵Despachar" || status === "🟦Despachado";
}

function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = type;
}

function updateShippingField() {
    const shouldShowShipping = isShippingStatus(orderStatus.value);
    shippingContainer.hidden = !shouldShowShipping;
    shippingInput.disabled = !shouldShowShipping;
    if (!shouldShowShipping) {
        shippingInput.value = "0";
    }
    calculateOrderTotal();
}

function addPeca() {
    itemCount += 1;
    const row = document.createElement("div");
    row.className = "product-row";
    row.dataset.productRow = "";
    row.innerHTML = `
        <div class="product-row-heading">
            <h4>Peça ${itemCount}</h4>
            <span class="product-row-number">${String(itemCount).padStart(2, "0")}</span>
        </div>
        <div class="product-fields">
            <div class="form-field product-description">
                <label for="f_peca${itemCount}">Produto <span>*</span></label>
                <input type="text" name="peca" id="f_peca${itemCount}" maxlength="160" required placeholder="Descrição da peça">
            </div>
            <div class="form-field">
                <label for="f_tamanho${itemCount}">Tamanho</label>
                <input type="text" name="tamanho" id="f_tamanho${itemCount}" maxlength="40" placeholder="Ex.: M, 38, Único">
            </div>
            <div class="form-field">
                <label for="f_qtd_peca${itemCount}">Quantidade <span>*</span></label>
                <input type="number" name="qtd_peca" id="f_qtd_peca${itemCount}" min="1" step="1" required value="1">
            </div>
            <div class="form-field">
                <label for="f_valor${itemCount}">Valor unitário <span>*</span></label>
                <div class="currency-field">
                    <span>R$</span>
                    <input type="number" name="valor_peca" id="f_valor${itemCount}" min="0" step="0.01" required placeholder="0,00">
                </div>
            </div>
        </div>
    `;
    itemsContainer.appendChild(row);
    updateItemCount();
    row.querySelector(`#f_peca${itemCount}`).focus();
    calculateOrderTotal();
}

function deletePeca() {
    if (itemCount <= 1) {
        return;
    }

    itemsContainer.lastElementChild.remove();
    itemCount -= 1;
    updateItemCount();
    calculateOrderTotal();
}

function updateItemCount() {
    document.getElementById("qtd_pecas").textContent = String(itemCount);
    itemsContainer.querySelectorAll("[data-product-row]").forEach((row, index) => {
        const number = index + 1;
        row.querySelector("h4").textContent = `Peça ${number}`;
        row.querySelector(".product-row-number").textContent = String(number).padStart(2, "0");
    });
}

function calculateOrderTotal() {
    const itemsSubtotal = [...itemsContainer.querySelectorAll("[data-product-row]")].reduce(
        (total, row) => {
            const quantity = Number(row.querySelector('[name="qtd_peca"]').value);
            const unitPrice = Number(row.querySelector('[name="valor_peca"]').value);
            if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
                return total;
            }
            return total + quantity * unitPrice;
        },
        0,
    );
    const shipping = isShippingStatus(orderStatus.value)
        ? Number(shippingInput.value) || 0
        : 0;
    document.getElementById("valor_total").textContent = (itemsSubtotal + shipping)
        .toFixed(2)
        .replace(".", ",");
}

function formatPhone(value) {
    let digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 6) {
        digits = digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    } else if (digits.length > 2) {
        digits = digits.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    } else if (digits.length > 0) {
        digits = digits.replace(/^(\d{0,2})/, "($1");
    }
    return digits;
}

async function pegarDados() {
    const storeName = document.getElementById("nome_loja");
    document.querySelector("#header a").href = storeId
        ? `/dashboard/${encodeURIComponent(storeId)}`
        : "/dashboard";
    try {
        const response = await fetch(`/api/takeData/${encodeURIComponent(storeId)}`);
        if (!response.ok) {
            throw new Error("Não foi possível carregar os dados da loja.");
        }
        const data = await response.json();
        storeName.textContent = data.usr.usrName;
    } catch (error) {
        showFeedback(
            error instanceof Error
                ? error.message
                : "Não foi possível carregar os dados da loja.",
            "erro",
        );
    }
}

async function enviarDados(event) {
    event.preventDefault();
    feedback.textContent = "";
    feedback.className = "";

    if (!orderForm.reportValidity()) {
        return;
    }

    if (!storeId) {
        showFeedback("Não foi possível identificar a loja do pedido.", "erro");
        return;
    }

    const listaPedidos = [...itemsContainer.querySelectorAll("[data-product-row]")].map(
        (row) => {
            const item = {
                desc_peca: row.querySelector('[name="peca"]').value.trim(),
                qtd_peca: row.querySelector('[name="qtd_peca"]').value,
                valor_peca: row.querySelector('[name="valor_peca"]').value,
            };
            const size = row.querySelector('[name="tamanho"]').value.trim();
            if (size) {
                item.tamanho = size;
            }
            return item;
        },
    );
    const status = orderStatus.value;
    const frete = isShippingStatus(status) ? Number(shippingInput.value) : 0;
    const pedido = {
        cliente: {
            nome: document.getElementById("f_nome").value.trim(),
            telefone: document.getElementById("f_telefone").value.trim(),
            endereco: document.getElementById("f_endereco").value.trim(),
            cep: document.getElementById("f_cep").value.trim(),
            complemento: document.getElementById("f_complemento").value.trim(),
        },
        listaPedidos,
        qtdPecas: listaPedidos.length,
        status,
        frete,
        valorTotal: 0,
        loja: storeId,
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        }),
    };

    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";
    try {
        const response = await fetch("/api/enviar-pedido", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pedido),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Não foi possível salvar o pedido.");
        }

        showFeedback(`Pedido #${result.pedido.id} criado com sucesso.`, "sucesso1");
        orderForm.reset();
        itemsContainer.innerHTML = "";
        itemCount = 0;
        addPeca();
        updateShippingField();
    } catch (error) {
        showFeedback(
            error instanceof Error
                ? error.message
                : "Erro ao enviar o pedido. Tente novamente.",
            "erro",
        );
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Salvar pedido";
    }
}

document.getElementById("add-item").addEventListener("click", addPeca);
document.getElementById("delete-item").addEventListener("click", deletePeca);
orderStatus.addEventListener("change", updateShippingField);
shippingInput.addEventListener("input", calculateOrderTotal);
itemsContainer.addEventListener("input", (event) => {
    if (
        event.target.matches('[name="qtd_peca"], [name="valor_peca"]')
    ) {
        calculateOrderTotal();
    }
});
document.getElementById("f_telefone").addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
});
orderForm.addEventListener("submit", enviarDados);

pegarDados();
updateShippingField();
