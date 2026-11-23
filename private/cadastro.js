/*
 * Cadastro da loja: validação dos dados, consulta de CEP e hash de senha.
 */
const crypto = require("crypto");
const { promisify } = require("util");

// Versão assíncrona: o cálculo roda fora da thread principal e não trava o servidor
const scrypt = promisify(crypto.scrypt);

/* ================= Senha (scrypt, nativo do Node) ================= */

const PREFIXO_HASH = "scrypt";

async function hashSenha(senha) {
    const sal = crypto.randomBytes(16).toString("hex");
    const hash = (await scrypt(senha, sal, 64)).toString("hex");
    return `${PREFIXO_HASH}$${sal}$${hash}`;
}

function isHash(valor) {
    return typeof valor === "string" && valor.startsWith(`${PREFIXO_HASH}$`);
}

/**
 * Confere a senha digitada com a guardada.
 * Aceita também senha antiga em texto puro (lojas cadastradas antes do hash).
 */
async function verificarSenha(senha, guardada) {
    if (typeof senha !== "string" || typeof guardada !== "string") {
        return false;
    }
    if (!isHash(guardada)) {
        const a = Buffer.from(senha);
        const b = Buffer.from(guardada);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    // Formato esperado: scrypt$<sal hex>$<hash hex de 64 bytes>. Se estiver corrompido, a senha não confere.
    const [, sal, hashGuardado] = guardada.split("$");
    if (!sal || !/^[0-9a-f]{128}$/i.test(hashGuardado || "")) {
        return false;
    }
    const hashDigitado = await scrypt(senha, sal, 64);
    const esperado = Buffer.from(hashGuardado, "hex");
    return crypto.timingSafeEqual(esperado, hashDigitado);
}

/* ================= Utilitários ================= */

const somenteDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");

// "São Paulo" -> "sao paulo" (para comparar cidade digitada com a do CEP)
const normalizar = (texto) =>
    String(texto ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

const UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// DDDs válidos no Brasil (Anatel)
const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
    69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
    96, 97, 98, 99,
]);

function telefoneValido(digitos) {
    if (!/^\d{10,11}$/.test(digitos) || !DDDS.has(Number(digitos.slice(0, 2)))) {
        return false;
    }
    const numero = digitos.slice(2);
    if (/^(\d)\1+$/.test(numero)) {
        return false; // 99999-9999, 00000000...
    }
    // Celular: 9 dígitos começando com 9 | Fixo: 8 dígitos começando com 2 a 5
    return digitos.length === 11 ? numero[0] === "9" : /^[2-5]/.test(numero);
}

function cnpjValido(digitos) {
    if (!/^\d{14}$/.test(digitos) || /^(\d)\1+$/.test(digitos)) {
        return false;
    }
    const calcular = (base) => {
        const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const soma = base.split("").reduce((total, d, i) => total + Number(d) * pesos[i], 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    const d1 = calcular(digitos.slice(0, 12));
    const d2 = calcular(digitos.slice(0, 12) + d1);
    return digitos.endsWith(`${d1}${d2}`);
}

/* ================= CEP (ViaCEP) ================= */

/**
 * Consulta o CEP no ViaCEP.
 * Retorna { existe: true, dados } | { existe: false } | { indisponivel: true } (sem internet)
 */
async function consultarCep(cep) {
    try {
        const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
            signal: AbortSignal.timeout(5000),
        });
        if (resposta.status === 400) {
            return { existe: false };
        }
        if (!resposta.ok) {
            return { indisponivel: true };
        }
        const dados = await resposta.json();
        if (dados.erro) {
            return { existe: false };
        }
        return {
            existe: true,
            dados: {
                cep: somenteDigitos(dados.cep),
                logradouro: dados.logradouro || "",
                bairro: dados.bairro || "",
                cidade: dados.localidade || "",
                uf: dados.uf || "",
            },
        };
    } catch (error) {
        console.warn("Não foi possível consultar o CEP (sem internet?):", error.message);
        return { indisponivel: true };
    }
}

/* ================= Validação do cadastro ================= */

const erro = (campo, mensagem) => ({ erro: { campo, mensagem } });

function texto(valor, maximo) {
    return typeof valor === "string" && valor.trim().length > 0 && valor.trim().length <= maximo;
}

/**
 * Valida os dados do formulário de cadastro.
 * Retorna { erro: { campo, mensagem } } ou { loja } pronta para salvar (com a senha já em hash).
 */
async function validarCadastro(dados) {
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return erro(null, "Dados do cadastro inválidos.");
    }

    // Loja
    if (!texto(dados.nomeLoja, 60) || dados.nomeLoja.trim().length < 2) {
        return erro("nomeLoja", "Informe o nome da loja (2 a 60 caracteres).");
    }
    const cnpj = somenteDigitos(dados.cnpj);
    if (dados.cnpj && !cnpjValido(cnpj)) {
        return erro("cnpj", "O CNPJ informado não é válido.");
    }
    const telefone = somenteDigitos(dados.telefone);
    if (!telefoneValido(telefone)) {
        return erro("telefone", "Informe um telefone válido com DDD, por exemplo (11) 91234-5678.");
    }

    // Endereço
    const cep = somenteDigitos(dados.cep);
    if (!/^\d{8}$/.test(cep)) {
        return erro("cep", "Informe um CEP com 8 dígitos.");
    }
    if (!texto(dados.logradouro, 120)) {
        return erro("logradouro", "Informe a rua ou avenida.");
    }
    if (!texto(dados.numero, 10)) {
        return erro("numero", "Informe o número (ou \"S/N\").");
    }
    if (dados.complemento !== undefined && dados.complemento !== "" && !texto(dados.complemento, 80)) {
        return erro("complemento", "O complemento pode ter no máximo 80 caracteres.");
    }
    if (!texto(dados.bairro, 80)) {
        return erro("bairro", "Informe o bairro.");
    }
    if (!texto(dados.cidade, 80)) {
        return erro("cidade", "Informe a cidade.");
    }
    const uf = String(dados.uf ?? "").trim().toUpperCase();
    if (!UFS.includes(uf)) {
        return erro("uf", "Selecione um estado (UF) válido.");
    }

    // Acesso
    const login = String(dados.login ?? "").trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(login)) {
        return erro("login", "O usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou _ (sem espaços).");
    }
    if (/^\d+$/.test(login)) {
        return erro("login", "O usuário não pode ter só números (para não confundir com o telefone).");
    }
    const senha = dados.senha;
    if (typeof senha !== "string" || senha.length < 8 || senha.length > 72) {
        return erro("senha", "A senha deve ter de 8 a 72 caracteres.");
    }
    if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
        return erro("senha", "A senha precisa ter pelo menos uma letra e um número.");
    }
    if (senha !== dados.confirmarSenha) {
        return erro("confirmarSenha", "As senhas não são iguais.");
    }

    // CEP real? (só bloqueia quando o ViaCEP confirma que não existe ou não bate)
    const consulta = await consultarCep(cep);
    if (consulta.existe === false) {
        return erro("cep", "Este CEP não existe. Confira os números.");
    }
    let cepVerificado = false;
    if (consulta.existe) {
        if (consulta.dados.uf !== uf) {
            return erro("uf", `O CEP ${cep.slice(0, 5)}-${cep.slice(5)} é de ${consulta.dados.uf}, não de ${uf}.`);
        }
        if (normalizar(consulta.dados.cidade) !== normalizar(dados.cidade)) {
            return erro("cidade", `O CEP ${cep.slice(0, 5)}-${cep.slice(5)} é de ${consulta.dados.cidade}, não de ${dados.cidade.trim()}.`);
        }
        cepVerificado = true;
    }

    const endereco = {
        cep,
        logradouro: dados.logradouro.trim(),
        numero: dados.numero.trim(),
        complemento: (dados.complemento || "").trim(),
        bairro: dados.bairro.trim(),
        cidade: consulta.existe ? consulta.dados.cidade : dados.cidade.trim(),
        uf,
    };

    // Endereço em uma linha (usado nas impressões)
    const address =
        `${endereco.logradouro}, ${endereco.numero}` +
        (endereco.complemento ? ` (${endereco.complemento})` : "") +
        ` - ${endereco.bairro}, ${endereco.cidade} - ${endereco.uf}, ${cep.slice(0, 5)}-${cep.slice(5)}`;

    return {
        loja: {
            login,
            usrName: dados.nomeLoja.trim(),
            pwd: await hashSenha(senha),
            tel: telefone,
            address,
            endereco,
            ...(cnpj ? { cnpj } : {}),
            cepVerificado,
            criadoEm: new Date().toISOString(),
        },
    };
}

module.exports = {
    validarCadastro,
    consultarCep,
    verificarSenha,
    hashSenha,
    isHash,
    somenteDigitos,
};
