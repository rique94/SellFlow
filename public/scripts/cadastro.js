const form = document.getElementById("form-cadastro");
const msg = document.getElementById("mensagem");
const submitButton = document.getElementById("cadastro-submit");
const cepStatus = document.getElementById("cep-status");
const campo = (nome) => document.getElementById(`f_${nome}`);

const CAMPOS = [
    "nomeLoja", "telefone", "cnpj", "cep", "logradouro", "numero", "complemento",
    "bairro", "cidade", "uf", "login", "senha", "confirmarSenha",
];

/* ================= Mensagens ================= */

function mostrarMensagem(texto, tipo = "erro") {
    msg.textContent = texto;
    msg.className = tipo === "info" ? "mensagem-info" : "mensagem";
}

function erroCampo(nome, texto) {
    const input = campo(nome);
    const saida = document.getElementById(`erro-${nome}`);
    if (!input || !saida) return;
    input.classList.toggle("campo-erro", Boolean(texto));
    input.setAttribute("aria-invalid", texto ? "true" : "false");
    saida.textContent = texto || "";
}

function limparErros() {
    msg.textContent = "";
    msg.className = "";
    CAMPOS.forEach((nome) => erroCampo(nome, ""));
}

/* ================= Máscaras ================= */

const digitos = (valor) => valor.replace(/\D/g, "");

function mascaraTelefone(valor) {
    const d = digitos(valor).slice(0, 11);
    if (d.length > 10) return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    if (d.length > 6) return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    if (d.length > 2) return d.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    if (d.length > 0) return d.replace(/^(\d{0,2})/, "($1");
    return "";
}

function mascaraCep(valor) {
    const d = digitos(valor).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function mascaraCnpj(valor) {
    const d = digitos(valor).slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

campo("telefone").addEventListener("input", (e) => (e.target.value = mascaraTelefone(e.target.value)));
campo("cnpj").addEventListener("input", (e) => (e.target.value = mascaraCnpj(e.target.value)));
campo("cep").addEventListener("input", (e) => {
    e.target.value = mascaraCep(e.target.value);
    if (digitos(e.target.value).length === 8) buscarCep();
});

/* ================= CEP ================= */

let ultimoCepBuscado = "";

function statusCep(texto, classe = "") {
    cepStatus.textContent = texto;
    cepStatus.className = `campo-dica ${classe}`.trim();
}

async function buscarCep() {
    const cep = digitos(campo("cep").value);
    if (cep.length !== 8 || cep === ultimoCepBuscado) return;
    ultimoCepBuscado = cep;
    erroCampo("cep", "");
    statusCep("Buscando endereço...", "carregando");

    try {
        const resposta = await fetch(`/api/cep/${cep}`);
        const dados = await resposta.json();
        if (digitos(campo("cep").value) !== cep) return; // CEP mudou enquanto buscava

        if (resposta.status === 404) {
            statusCep("O endereço é preenchido pelo CEP.");
            erroCampo("cep", dados.error);
            return;
        }
        if (!resposta.ok) {
            ultimoCepBuscado = ""; // permite tentar o mesmo CEP de novo
            statusCep(dados.error || "Não foi possível consultar o CEP. Preencha manualmente.", "alerta");
            return;
        }

        // Preenche só o que veio do CEP (CEP geral de cidade não tem rua/bairro)
        if (dados.logradouro) campo("logradouro").value = dados.logradouro;
        if (dados.bairro) campo("bairro").value = dados.bairro;
        campo("cidade").value = dados.cidade;
        campo("uf").value = dados.uf;
        ["logradouro", "bairro", "cidade", "uf"].forEach((nome) => erroCampo(nome, ""));
        statusCep(`✓ ${dados.cidade} - ${dados.uf}`, "ok");
        (dados.logradouro ? campo("numero") : campo("logradouro")).focus();
    } catch {
        ultimoCepBuscado = ""; // permite tentar o mesmo CEP de novo
        statusCep("Não foi possível consultar o CEP. Preencha manualmente.", "alerta");
    }
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
});

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

// Ao digitar de novo, some o erro daquele campo
CAMPOS.forEach((nome) => {
    const input = campo(nome);
    input?.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => erroCampo(nome, ""));
});

/* ================= Validação no navegador (o servidor valida de novo) ================= */

function validar(dados) {
    if (dados.nomeLoja.length < 2) return ["nomeLoja", "Informe o nome da loja."];
    if (![10, 11].includes(digitos(dados.telefone).length)) return ["telefone", "Informe o telefone com DDD."];
    if (dados.cnpj && digitos(dados.cnpj).length !== 14) return ["cnpj", "O CNPJ deve ter 14 dígitos."];
    if (digitos(dados.cep).length !== 8) return ["cep", "Informe um CEP com 8 dígitos."];
    if (!dados.logradouro) return ["logradouro", "Informe a rua ou avenida."];
    if (!dados.numero) return ["numero", "Informe o número (ou \"S/N\")."];
    if (!dados.bairro) return ["bairro", "Informe o bairro."];
    if (!dados.cidade) return ["cidade", "Informe a cidade."];
    if (!dados.uf) return ["uf", "Selecione o estado."];
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(dados.login)) return ["login", "Use de 3 a 30 caracteres: letras, números, ponto, hífen ou _ (sem espaços)."];
    if (!Object.values(regras).every((regra) => regra(dados.senha))) return ["senha", "A senha precisa ter 8 caracteres, uma letra e um número."];
    if (dados.senha !== dados.confirmarSenha) return ["confirmarSenha", "As senhas não são iguais."];
    return null;
}

function lerFormulario() {
    const dados = {};
    CAMPOS.forEach((nome) => {
        const valor = campo(nome).value;
        dados[nome] = nome === "senha" || nome === "confirmarSenha" ? valor : valor.trim();
    });
    return dados;
}

/* ================= Envio ================= */

function setCarregando(carregando) {
    submitButton.disabled = carregando;
    submitButton.textContent = carregando ? "Verificando dados..." : "Cadastrar loja";
}

function mostrarTela(id) {
    document.getElementById("cadastro-conteudo").hidden = true;
    document.getElementById("cadastro-sucesso").hidden = id !== "cadastro-sucesso";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparErros();

    const dados = lerFormulario();
    const problema = validar(dados);
    if (problema) {
        const [nome, texto] = problema;
        erroCampo(nome, texto);
        campo(nome).focus();
        return;
    }

    setCarregando(true);
    try {
        const resposta = await fetch("/api/cadastro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados),
        });
        const resultado = await resposta.json().catch(() => ({}));

        if (resposta.status === 201) {
            document.getElementById("sucesso-texto").textContent =
                `A loja "${resultado.loja.usrName}" está pronta. Entre com o usuário "${resultado.loja.login}" e a senha que você criou.`;
            mostrarTela("cadastro-sucesso");
            document.getElementById("sucesso-titulo").focus();
            return;
        }
        // 409 = usuário ou telefone já usados por outra loja (o servidor diz qual campo)
        if (resultado.campo && campo(resultado.campo)) {
            erroCampo(resultado.campo, resultado.error);
            campo(resultado.campo).focus();
        } else {
            mostrarMensagem(resultado.error || "Não foi possível cadastrar a loja. Tente novamente.");
        }
    } catch {
        mostrarMensagem("Não foi possível conectar ao sistema. Verifique sua internet.");
    }
    setCarregando(false);
});
