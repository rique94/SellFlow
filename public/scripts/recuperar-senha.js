const form = document.getElementById("form-recuperar");
const campoEmail = document.getElementById("f_email");
const msg = document.getElementById("mensagem");
const submitButton = document.getElementById("recuperar-submit");

function mostrarMensagem(texto) {
    msg.textContent = texto;
    msg.className = "mensagem";
}

function limparMensagem() {
    msg.textContent = "";
    msg.className = "";
    campoEmail.classList.remove("campo-erro");
}

function setCarregando(carregando) {
    submitButton.disabled = carregando;
    submitButton.textContent = carregando ? "Enviando..." : "Enviar link";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparMensagem();

    const email = campoEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        mostrarMensagem("Informe um e-mail válido.");
        campoEmail.classList.add("campo-erro");
        campoEmail.focus();
        return;
    }

    setCarregando(true);
    try {
        const resposta = await fetch("/api/senha/esqueci", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const resultado = await resposta.json().catch(() => ({}));

        if (resposta.ok) {
            // A resposta é a mesma exista a loja ou não (ninguém descobre quais e-mails têm conta)
            document.getElementById("enviado-texto").textContent =
                `Se houver uma loja com o e-mail ${email}, enviamos um link para criar uma senha nova.`;
            document.getElementById("recuperar-conteudo").hidden = true;
            document.getElementById("recuperar-enviado").hidden = false;
            document.getElementById("enviado-titulo").focus();
            return;
        }
        mostrarMensagem(resultado.error || "Não foi possível enviar o link. Tente novamente.");
    } catch {
        mostrarMensagem("Não foi possível conectar ao sistema. Verifique sua internet.");
    }
    setCarregando(false);
});

campoEmail.addEventListener("input", limparMensagem);
