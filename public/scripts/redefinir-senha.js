const form = document.getElementById("form-redefinir");
const msg = document.getElementById("mensagem");
const submitButton = document.getElementById("redefinir-submit");
const campo = (nome) => document.getElementById(`f_${nome}`);

// O token vem depois do # no link do e-mail. Tira ele da barra de endereço (e do histórico)
// e guarda só na memória desta página.
const token = window.location.hash.slice(1);
history.replaceState(null, "", window.location.pathname);

const TELAS = ["redefinir-carregando", "redefinir-conteudo", "redefinir-invalido", "redefinir-sucesso"];

function mostrarTela(id, foco) {
    TELAS.forEach((tela) => (document.getElementById(tela).hidden = tela !== id));
    if (foco) document.getElementById(foco).focus();
}

function mostrarMensagem(texto) {
    msg.textContent = texto;
    msg.className = "mensagem";
}

function erroCampo(nome, texto) {
    campo(nome).classList.toggle("campo-erro", Boolean(texto));
    campo(nome).setAttribute("aria-invalid", texto ? "true" : "false");
    document.getElementById(`erro-${nome}`).textContent = texto || "";
}

function limparErros() {
    msg.textContent = "";
    msg.className = "";
    ["senha", "confirmarSenha"].forEach((nome) => erroCampo(nome, ""));
}

/* ================= Senha ================= */

const regras = {
    tamanho: (s) => s.length >= 8,
    letra: (s) => /[A-Za-z]/.test(s),
    numero: (s) => /\d/.test(s),
};

campo("senha").addEventListener("input", () => {
    const senha = campo("senha").value;
    document.querySelectorAll("#regras-senha li").forEach((li) => {
        li.classList.toggle("ok", regras[li.dataset.regra](senha));
    });
    erroCampo("senha", "");
});
campo("confirmarSenha").addEventListener("input", () => erroCampo("confirmarSenha", ""));

document.querySelectorAll(".toggle-password").forEach((botao) => {
    botao.addEventListener("click", () => {
        const input = document.getElementById(botao.dataset.alvo);
        const mostrar = input.type === "password";
        input.type = mostrar ? "text" : "password";
        botao.setAttribute("aria-pressed", String(mostrar));
        botao.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
        input.focus();
    });
});

/* ================= Envio ================= */

function setCarregando(carregando) {
    submitButton.disabled = carregando;
    submitButton.textContent = carregando ? "Salvando..." : "Salvar senha nova";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparErros();

    const senha = campo("senha").value;
    const confirmarSenha = campo("confirmarSenha").value;
    if (!Object.values(regras).every((regra) => regra(senha))) {
        erroCampo("senha", "A senha precisa ter 8 caracteres, uma letra e um número.");
        campo("senha").focus();
        return;
    }
    if (senha !== confirmarSenha) {
        erroCampo("confirmarSenha", "As senhas não são iguais.");
        campo("confirmarSenha").focus();
        return;
    }

    setCarregando(true);
    try {
        const resposta = await fetch("/api/senha/redefinir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, senha, confirmarSenha }),
        });
        const resultado = await resposta.json().catch(() => ({}));

        if (resposta.ok) {
            mostrarTela("redefinir-sucesso", "sucesso-titulo");
            return;
        }
        if (resultado.expirado) {
            mostrarTela("redefinir-invalido", "invalido-titulo");
            return;
        }
        if (resultado.campo && campo(resultado.campo)) {
            erroCampo(resultado.campo, resultado.error);
            campo(resultado.campo).focus();
        } else {
            mostrarMensagem(resultado.error || "Não foi possível salvar a senha. Tente novamente.");
        }
    } catch {
        mostrarMensagem("Não foi possível conectar ao sistema. Verifique sua internet.");
    }
    setCarregando(false);
});

/* ================= Início: o link ainda vale? ================= */

(async () => {
    if (!/^[0-9a-f]{64}$/.test(token)) {
        mostrarTela("redefinir-invalido");
        return;
    }
    try {
        const resposta = await fetch("/api/senha/verificar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        });
        const { valido } = await resposta.json();
        if (valido) {
            mostrarTela("redefinir-conteudo");
            campo("senha").focus();
        } else {
            mostrarTela("redefinir-invalido");
        }
    } catch {
        // Sem conexão agora: mostra o formulário; o envio confere o link de novo
        mostrarTela("redefinir-conteudo");
    }
})();
