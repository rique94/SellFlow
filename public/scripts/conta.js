const form = document.getElementById("form-email");
const msg = document.getElementById("mensagem");
const botao = document.getElementById("salvar-email");
const campo = (nome) => document.getElementById(`f_${nome}`);

/* ================= Mensagens ================= */

function mostrarMensagem(texto, tipo) {
    msg.textContent = texto;
    msg.className = tipo;
}

function erroCampo(nome, texto) {
    campo(nome).classList.toggle("campo-erro", Boolean(texto));
    campo(nome).setAttribute("aria-invalid", texto ? "true" : "false");
    document.getElementById(`erro-${nome}`).textContent = texto || "";
}

function limparErros() {
    mostrarMensagem("", "");
    ["email", "senha"].forEach((nome) => erroCampo(nome, ""));
}

["email", "senha"].forEach((nome) => campo(nome).addEventListener("input", () => erroCampo(nome, "")));

/* ================= Dados da loja ================= */

function formatarTelefone(digitos) {
    const d = String(digitos || "");
    if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
    if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
    return d || "—";
}

function formatarCnpj(digitos) {
    const d = String(digitos || "");
    return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "Não informado";
}

function mostrarSelo(temEmail) {
    const selo = document.getElementById("selo-email");
    selo.hidden = false;
    selo.className = `conta-selo ${temEmail ? "ok" : "pendente"}`;
    selo.textContent = temEmail ? "✓ Cadastrado" : "Não cadastrado";
}

function mostrarLoja(loja) {
    document.getElementById("nome_loja").textContent = loja.usrName;
    document.getElementById("dado-nome").textContent = loja.usrName;
    document.getElementById("dado-login").textContent = loja.login;
    document.getElementById("dado-telefone").textContent = formatarTelefone(loja.tel);
    document.getElementById("dado-cnpj").textContent = formatarCnpj(loja.cnpj);
    document.getElementById("dado-endereco").textContent = loja.address || "—";
    campo("email").value = loja.email || "";
    mostrarSelo(Boolean(loja.email));
}

/* ================= Salvar e-mail ================= */

function setCarregando(carregando) {
    botao.disabled = carregando;
    botao.textContent = carregando ? "Salvando..." : "Salvar e-mail";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparErros();

    const email = campo("email").value.trim();
    const senha = campo("senha").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        erroCampo("email", "Informe um e-mail válido.");
        campo("email").focus();
        return;
    }
    if (!senha) {
        erroCampo("senha", "Digite a sua senha atual.");
        campo("senha").focus();
        return;
    }

    setCarregando(true);
    try {
        const resposta = await fetch("/api/loja/email", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha }),
        });
        const resultado = await resposta.json().catch(() => ({}));

        if (resposta.ok) {
            mostrarLoja(resultado.loja);
            campo("senha").value = "";
            mostrarMensagem("E-mail salvo. Os links de recuperação de senha vão chegar nele.", "sucesso");
        } else if (resultado.campo && campo(resultado.campo)) {
            erroCampo(resultado.campo, resultado.error);
            if (resultado.campo === "senha") campo("senha").select();
            campo(resultado.campo).focus();
        } else {
            mostrarMensagem(resultado.error || "Não foi possível salvar o e-mail. Tente novamente.", "erro");
        }
    } catch {
        mostrarMensagem("Não foi possível conectar ao sistema. Verifique sua internet.", "erro");
    }
    setCarregando(false);
});

/* ================= Início ================= */

(async () => {
    try {
        const resposta = await fetch("/api/loja");
        if (!resposta.ok) throw new Error();
        mostrarLoja(await resposta.json());
        // Veio do aviso do painel: já deixa o campo pronto para digitar
        if (!campo("email").value) campo("email").focus();
    } catch {
        const aviso = document.getElementById("aviso-carregar");
        aviso.textContent = "Não foi possível carregar os dados da loja. Recarregue a página.";
        aviso.hidden = false;
    }
})();
