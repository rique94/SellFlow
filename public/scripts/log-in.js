const msg = document.getElementById("mensagem");
const login = document.getElementById("f_loja_login");
const passwd = document.getElementById("f_loja_password");
const form = document.getElementById("form");
const submitButton = document.getElementById("login-submit");
const togglePassword = document.getElementById("toggle-password");

// Mostra uma mensagem: "erro" (vermelha) ou "info" (azul)
function mostrarMensagem(texto, tipo = "erro") {
    msg.textContent = texto;
    msg.className = tipo === "info" ? "mensagem-info" : "mensagem";
}

function limparMensagem() {
    msg.textContent = "";
    msg.className = "";
    login.classList.remove("campo-erro");
    passwd.classList.remove("campo-erro");
}

function setCarregando(carregando) {
    submitButton.disabled = carregando;
    submitButton.textContent = carregando ? "Entrando..." : "Entrar →";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparMensagem();

    const usuario = login.value.trim();
    const senha = passwd.value;

    if (!usuario || !senha) {
        mostrarMensagem("Está sem o usuário ou senha!");
        const campoVazio = !usuario ? login : passwd;
        campoVazio.classList.add("campo-erro");
        campoVazio.focus();
        return;
    }

    setCarregando(true);
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usr: usuario, pwd: senha }),
        });

        if (response.status === 200) {
            window.location.replace("/dashboard");
            return;
        }

        if (response.status === 401) {
            mostrarMensagem("Nome, telefone ou senha estão incorretos");
            passwd.classList.add("campo-erro");
            passwd.select();
        } else if (response.status === 503) {
            mostrarMensagem("Nenhuma loja cadastrada nesta instalação.");
        } else {
            mostrarMensagem("Não foi possível entrar. Tente novamente.");
        }
    } catch {
        mostrarMensagem("Não foi possível conectar ao sistema. Verifique se o SellFlow está aberto.");
    }
    setCarregando(false);
});

// Remove o destaque de erro assim que a pessoa volta a digitar
[login, passwd].forEach((campo) => {
    campo.addEventListener("input", () => campo.classList.remove("campo-erro"));
});

togglePassword.addEventListener("click", () => {
    const mostrar = passwd.type === "password";
    passwd.type = mostrar ? "text" : "password";
    togglePassword.setAttribute("aria-pressed", String(mostrar));
    togglePassword.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
    passwd.focus();
});

// Ainda não há recuperação automática: o sistema roda só neste computador
document.getElementById("forgot-password").addEventListener("click", (event) => {
    event.preventDefault();
    limparMensagem();
    mostrarMensagem(
        "Como o sistema roda só neste computador, peça ao responsável pela loja para redefinir a senha.",
        "info",
    );
});
