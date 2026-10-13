const routeParts = window.location.pathname.split("/").filter(Boolean);
const storeId = routeParts[1];
const orderId = routeParts[2];
const statuses = [
    ["🔴Pagar", "🔴 Pagar"],
    ["🟡Retirar", "🟡 Retirar (pago)"],
    ["🟣Pagar local", "🟣 Pagar local"],
    ["✅Finalizado", "✅ Finalizado"],
    ["🔵Despachar", "🔵 A despachar"],
    ["🟦Despachado", "🟦 Despachado"],
];

let currentOrder;
let currentStore;
let originalOrder;
let isEditing = false;
let isSaving = false;

const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);

const formatValue = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return entities[character];
    });
}

function getItems() {
    return Array.isArray(currentOrder.listaPedidos)
        ? currentOrder.listaPedidos
        : [];
}

function isShippingStatus(status) {
    return status === "🔵Despachar" || status === "🟦Despachado";
}

function renderOrder(order, store) {
    currentOrder = order;
    currentStore = store;
    document.getElementById("delete-order").disabled = false;
    document.getElementById("order-title").textContent = `Pedido #${order.id}`;

    const dateTime =
        [order.data, order.hora].filter(Boolean).join(" às ") || "—";
    const customer = order.cliente || {};
    const storeName = store.usrName || "—";
    const address = [
        customer.endereco,
        customer.cep ? `CEP ${customer.cep}` : "",
        customer.complemento,
    ]
        .filter(Boolean)
        .join(" · ");

    setText("order-date-text", dateTime);
    setText("order-datetime", dateTime);
    setText("order-store-text", storeName);
    setText("order-store-name", storeName);
    setText("order-id", `#${order.id}`);
    setText("customer-name", customer.nome || "—");
    setText("customer-phone", customer.telefone || "—");
    setText("customer-address", address || "Não informado");
    setText(
        "order-payment",
        order.formaPagamento || order.pagamento || "Não informado",
    );
    setText(
        "order-notes",
        order.observacoes || order.observacao || "Nenhuma observação informada.",
    );
    document.getElementById("back-to-orders").href =
        `/dashboard/${encodeURIComponent(storeId)}`;

    const statusElement = document.getElementById("order-status");
    if (isEditing) {
        statusElement.innerHTML = renderStatusSelect(order.status);
        renderEditorFields();
    } else {
        statusElement.textContent = order.status || "—";
    }

    renderItems();
    renderSummary();

    document.getElementById("edit-order-form").classList.toggle("is-editing", isEditing);
    document.getElementById("edit-order").hidden = isEditing;
    document.getElementById("save-order").hidden = !isEditing;
    document.getElementById("cancel-edit").hidden = !isEditing;
    document.getElementById("print-order").hidden = isEditing;
    document.getElementById("delete-order").hidden = isEditing;
    document.getElementById("add-order-item").hidden = !isEditing;
    document.querySelector(".items-table th.edit-only").hidden = !isEditing;
}

function renderStatusSelect(selectedStatus) {
    const options = statuses
        .map(
            ([value, label]) =>
                `<option value="${escapeHtml(value)}" ${value === selectedStatus ? "selected" : ""}>${escapeHtml(label)}</option>`,
        )
        .join("");
    return `<select class="edit-field" id="edit-order-status" aria-label="Status do pedido">${options}</select>`;
}

function renderItems() {
    const itemsBody = document.getElementById("order-items");
    const items = getItems();

    if (!items.length) {
        itemsBody.innerHTML = `<tr><td colspan="${isEditing ? 7 : 6}" class="table-message">${isEditing ? "Adicione pelo menos um item ao pedido." : "Este pedido não possui itens."}</td></tr>`;
        return;
    }

    itemsBody.innerHTML = items
        .map((item, index) => {
            const quantity = formatValue(item.qtd_peca);
            const unitPrice = formatValue(item.valor_peca);
            const size = item.tamanho || item.size || "";
            const cells = isEditing
                ? `
                    <td>${index + 1}</td>
                    <td><input class="edit-field edit-item-description" aria-label="Produto ${index + 1}" maxlength="160" required value="${escapeHtml(item.desc_peca || "")}"></td>
                    <td><input class="edit-field edit-item-size" aria-label="Tamanho ${index + 1}" maxlength="40" value="${escapeHtml(size)}"></td>
                    <td><input class="edit-field edit-item-quantity" aria-label="Quantidade ${index + 1}" type="number" min="1" step="1" required value="${quantity}"></td>
                    <td><input class="edit-field edit-item-price" aria-label="Valor unitário ${index + 1}" type="number" min="0" step="0.01" required value="${unitPrice.toFixed(2)}"></td>
                    <td class="item-subtotal">${formatCurrency(quantity * unitPrice)}</td>
                    <td><button class="remove-item-button" type="button" data-remove-item="${index}" aria-label="Remover produto ${index + 1}">Remover</button></td>
                `
                : `
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.desc_peca || "Produto sem descrição")}</td>
                    <td>${escapeHtml(size || "—")}</td>
                    <td>${quantity}</td>
                    <td>${formatCurrency(unitPrice)}</td>
                    <td>${formatCurrency(quantity * unitPrice)}</td>
                `;
            return `<tr>${cells}</tr>`;
        })
        .join("");
}

function renderSummary() {
    const items = getItems();
    const subtotal = items.reduce(
        (total, item) =>
            total + formatValue(item.qtd_peca) * formatValue(item.valor_peca),
        0,
    );
    const selectedStatus =
        document.getElementById("edit-order-status")?.value || currentOrder.status;
    const shipping = isShippingStatus(selectedStatus)
        ? formatValue(currentOrder.frete)
        : 0;
    const total = isEditing
        ? subtotal + shipping
        : Number.isFinite(Number(currentOrder.valorTotal))
          ? Number(currentOrder.valorTotal)
          : subtotal;

    setText(
        "items-count",
        `Subtotal (${items.length} ${items.length === 1 ? "item" : "itens"})`,
    );
    setText("summary-subtotal", formatCurrency(subtotal));
    const shippingElement = document.getElementById("summary-shipping");
    if (isEditing && isShippingStatus(selectedStatus)) {
        shippingElement.innerHTML = `<input class="edit-field" id="edit-order-shipping" type="number" min="0" max="10000000" step="0.01" required aria-label="Valor do frete" value="${formatValue(currentOrder.frete)}">`;
    } else {
        shippingElement.textContent = formatCurrency(shipping);
    }
    setText("summary-total", formatCurrency(total));
}

function renderEditorFields() {
    const customer = currentOrder.cliente || {};
    document.getElementById("customer-name").innerHTML =
        `<input class="edit-field" id="edit-customer-name" aria-label="Nome do cliente" maxlength="120" required value="${escapeHtml(customer.nome || "")}">`;
    document.getElementById("customer-phone").innerHTML =
        `<input class="edit-field" id="edit-customer-phone" aria-label="Telefone do cliente" maxlength="30" required value="${escapeHtml(customer.telefone || "")}">`;
    document.getElementById("customer-address").innerHTML = `
        <div class="address-edit-fields">
            <input class="edit-field" id="edit-customer-address" aria-label="Endereço" maxlength="250" placeholder="Endereço" value="${escapeHtml(customer.endereco || "")}">
            <input class="edit-field" id="edit-customer-cep" aria-label="CEP" maxlength="12" placeholder="CEP" value="${escapeHtml(customer.cep || "")}">
            <input class="edit-field" id="edit-customer-complement" aria-label="Complemento" maxlength="250" placeholder="Complemento" value="${escapeHtml(customer.complemento || "")}">
        </div>
    `;
}

function beginEditing() {
    if (!currentOrder || isSaving) {
        return;
    }

    originalOrder = JSON.parse(JSON.stringify(currentOrder));
    isEditing = true;
    document.getElementById("details-feedback").hidden = true;
    renderOrder(currentOrder, currentStore);
    document.getElementById("edit-customer-name").focus();
}

function cancelEditing() {
    if (isSaving) {
        return;
    }

    isEditing = false;
    currentOrder = originalOrder;
    originalOrder = null;
    document.getElementById("details-feedback").hidden = true;
    renderOrder(currentOrder, currentStore);
}

function addItem() {
    if (!Array.isArray(currentOrder.listaPedidos)) {
        currentOrder.listaPedidos = [];
    }
    currentOrder.listaPedidos.push({
        desc_peca: "",
        qtd_peca: "1",
        valor_peca: "0",
    });
    renderItems();
    renderSummary();
    document.querySelector(".edit-item-description:last-of-type")?.focus();
}

function updateEditedTotals() {
    const rows = [
        ...document.querySelectorAll("#order-items tr"),
    ].filter((row) => row.querySelector(".edit-item-quantity"));
    let subtotal = 0;

    rows.forEach((row) => {
        const quantity = Number(row.querySelector(".edit-item-quantity")?.value);
        const price = Number(row.querySelector(".edit-item-price")?.value);
        const rowTotal =
            Number.isFinite(quantity) && Number.isFinite(price)
                ? quantity * price
                : 0;
        subtotal += rowTotal;
        const subtotalCell = row.querySelector(".item-subtotal");
        if (subtotalCell) {
            subtotalCell.textContent = formatCurrency(rowTotal);
        }
    });

    setText(
        "items-count",
        `Subtotal (${rows.length} ${rows.length === 1 ? "item" : "itens"})`,
    );
    const selectedStatus = document.getElementById("edit-order-status").value;
    const shipping = isShippingStatus(selectedStatus)
        ? Number(document.getElementById("edit-order-shipping")?.value) || 0
        : 0;
    setText("summary-subtotal", formatCurrency(subtotal));
    setText("summary-total", formatCurrency(subtotal + shipping));
}

function getEditedOrder() {
    const form = document.getElementById("edit-order-form");
    if (!form.reportValidity()) {
        return null;
    }

    const rows = [
        ...document.querySelectorAll("#order-items tr"),
    ].filter((row) => row.querySelector(".edit-item-description"));
    const items = rows.map((row) => {
        const existing = getItems()[Number(row.querySelector("[data-remove-item]")?.dataset.removeItem)] || {};
        const description = row.querySelector(".edit-item-description").value.trim();
        const size = row.querySelector(".edit-item-size").value.trim();
        const quantity = Number(row.querySelector(".edit-item-quantity").value);
        const unitPrice = Number(row.querySelector(".edit-item-price").value);
        const item = {
            ...existing,
            desc_peca: description,
            qtd_peca: String(quantity),
            valor_peca: String(unitPrice),
        };

        if (size) {
            item.tamanho = size;
            delete item.size;
        } else {
            delete item.tamanho;
            delete item.size;
        }
        return item;
    });

    if (items.length === 0) {
        showFeedback("O pedido precisa ter pelo menos um item.", true);
        return null;
    }

    const status = document.getElementById("edit-order-status").value;
    const shipping = isShippingStatus(status)
        ? Number(document.getElementById("edit-order-shipping")?.value)
        : 0;

    return {
        cliente: {
            nome: document.getElementById("edit-customer-name").value.trim(),
            telefone: document.getElementById("edit-customer-phone").value.trim(),
            endereco: document.getElementById("edit-customer-address").value.trim(),
            cep: document.getElementById("edit-customer-cep").value.trim(),
            complemento: document
                .getElementById("edit-customer-complement")
                .value.trim(),
        },
        listaPedidos: items,
        status,
        frete: shipping,
    };
}

function showFeedback(message, isError = false) {
    const feedback = document.getElementById("details-feedback");
    feedback.textContent = message;
    feedback.classList.toggle("feedback-error", isError);
    feedback.classList.toggle("feedback-success", !isError);
    feedback.hidden = false;
}

async function saveOrder(event) {
    event.preventDefault();
    if (isSaving) {
        return;
    }

    const editedOrder = getEditedOrder();
    if (!editedOrder) {
        return;
    }

    isSaving = true;
    const saveButton = document.getElementById("save-order");
    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";

    try {
        const response = await fetch(
            `/api/pedidos/${encodeURIComponent(storeId)}/${encodeURIComponent(orderId)}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editedOrder),
            },
        );
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Não foi possível salvar o pedido.");
        }

        isEditing = false;
        originalOrder = null;
        renderOrder(result.pedido, currentStore);
        showFeedback("Pedido atualizado com sucesso.");
    } catch (error) {
        showFeedback(
            error instanceof Error
                ? error.message
                : "Não foi possível salvar o pedido.",
            true,
        );
    } finally {
        isSaving = false;
        saveButton.disabled = false;
        saveButton.innerHTML = "Salvar alterações";
    }
}

async function deleteOrder() {
    if (!currentOrder || isEditing || isSaving) {
        return;
    }

    const confirmed = window.confirm(
        `Tem certeza de que deseja excluir o pedido #${currentOrder.id}? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) {
        return;
    }

    isSaving = true;
    const deleteButton = document.getElementById("delete-order");
    deleteButton.disabled = true;
    deleteButton.textContent = "Excluindo...";

    try {
        const response = await fetch(
            `/api/pedidos/${encodeURIComponent(storeId)}/${encodeURIComponent(orderId)}`,
            { method: "DELETE" },
        );
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Não foi possível excluir o pedido.");
        }

        window.location.assign(`/dashboard/${encodeURIComponent(storeId)}`);
    } catch (error) {
        showFeedback(
            error instanceof Error
                ? error.message
                : "Não foi possível excluir o pedido.",
            true,
        );
    } finally {
        isSaving = false;
        deleteButton.disabled = false;
        deleteButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7" />
            </svg>
            Excluir
        `;
    }
}

async function loadOrderDetails() {
    const feedback = document.getElementById("details-feedback");
    document.getElementById("back-to-orders").href = storeId
        ? `/dashboard/${encodeURIComponent(storeId)}`
        : "/dashboard";

    if (!storeId || !orderId) {
        showFeedback("Não foi possível identificar a loja e o pedido.", true);
        return;
    }

    try {
        const response = await fetch(
            `/api/takeData/${encodeURIComponent(storeId)}`,
        );
        if (!response.ok) {
            throw new Error(
                `Falha ao carregar os dados da loja (${response.status}).`,
            );
        }

        const data = await response.json();
        const order = (data.pedidos || []).find(
            (item) => String(item.id) === orderId,
        );

        if (!order) {
            throw new Error("O pedido solicitado não foi encontrado.");
        }

        renderOrder(order, data.usr || {});
    } catch (error) {
        showFeedback(
            error instanceof Error
                ? error.message
                : "Não foi possível carregar os detalhes do pedido.",
            true,
        );
        setText("order-title", orderId ? `Pedido #${orderId}` : "Pedido");
        setText("order-date-text", "—");
        setText("order-store-text", "—");
        document.getElementById("order-items").innerHTML =
            '<tr><td colspan="7" class="table-message">Não foi possível carregar os itens.</td></tr>';
    }
}

document.getElementById("edit-order").addEventListener("click", beginEditing);
document.getElementById("cancel-edit").addEventListener("click", cancelEditing);
document.getElementById("edit-order-form").addEventListener("submit", saveOrder);
document.getElementById("add-order-item").addEventListener("click", addItem);
document.getElementById("delete-order").addEventListener("click", deleteOrder);
document.getElementById("print-order").addEventListener("click", () => {
    window.print();
});

document.getElementById("order-items").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-item]");
    if (!removeButton) {
        return;
    }
    currentOrder.listaPedidos.splice(Number(removeButton.dataset.removeItem), 1);
    renderItems();
    updateEditedTotals();
});

document.getElementById("edit-order-form").addEventListener("input", (event) => {
    if (
        event.target.matches(
            ".edit-item-quantity, .edit-item-price, #edit-order-shipping",
        )
    ) {
        if (event.target.matches("#edit-order-shipping")) {
            currentOrder.frete = Number(event.target.value) || 0;
        }
        updateEditedTotals();
    }
});
document.getElementById("edit-order-form").addEventListener("change", (event) => {
    if (event.target.matches("#edit-order-status")) {
        if (!isShippingStatus(event.target.value)) {
            currentOrder.frete = 0;
        }
        renderSummary();
        updateEditedTotals();
    }
});

loadOrderDetails();
