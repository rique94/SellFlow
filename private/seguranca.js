/*
 * Segurança do SellFlow: Host permitido, cabeçalhos, sessão de login e limite de tentativas.
 */
const crypto = require("crypto");

/* ================= Host e origem (contra DNS rebinding e CSRF) ================= */

// O sistema roda só nesta máquina: qualquer outro Host indica DNS rebinding
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function nomeDoHost(valor) {
    const host = String(valor || "").toLowerCase();
    // "[::1]:3000" -> "[::1]" | "localhost:3000" -> "localhost"
    return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function origemLocal(origem) {
    try {
        return HOSTS_LOCAIS.has(nomeDoHost(new URL(origem).host));
    } catch {
        return false;
    }
}

function exigirHostLocal(req, res, next) {
    if (!HOSTS_LOCAIS.has(nomeDoHost(req.headers.host))) {
        return res.status(421).type("text/plain").send("Endereço não permitido.");
    }
    // Pedidos que alteram dados só podem vir das páginas do próprio sistema
    const origem = req.headers.origin;
    if (!["GET", "HEAD"].includes(req.method) && origem && !origemLocal(origem)) {
        return res.status(403).json({ error: "Origem não permitida." });
    }
    next();
}

/* ================= Cabeçalhos de segurança ================= */

const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

function cabecalhosSeguranca(req, res, next) {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
    }
    next();
}

/* ================= Sessão ================= */

const COOKIE = "sellflow_sessao";
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas sem uso encerram a sessão
const sessoes = new Map(); // token -> { loja, ultimoUso }

// Identifica a loja atual: se a loja for apagada e outra cadastrada, as sessões antigas deixam de valer
const idDaLoja = (loja) => `${loja.login}|${loja.criadoEm || ""}`;

function lerCookie(req, nome) {
    const cabecalho = req.headers.cookie || "";
    for (const parte of cabecalho.split(";")) {
        const [chave, ...resto] = parte.trim().split("=");
        if (chave === nome) return resto.join("=");
    }
    return null;
}

function definirCookie(res, valor, maxAgeSegundos) {
    res.append("Set-Cookie", `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSegundos}`);
}

function criarSessao(res, loja) {
    const token = crypto.randomBytes(32).toString("hex");
    sessoes.set(token, { loja: idDaLoja(loja), ultimoUso: Date.now() });
    definirCookie(res, token, DURACAO_MS / 1000);
}

function sessaoValida(req, loja) {
    const token = lerCookie(req, COOKIE);
    const sessao = token && sessoes.get(token);
    if (!sessao || !loja) return false;
    if (Date.now() - sessao.ultimoUso > DURACAO_MS || sessao.loja !== idDaLoja(loja)) {
        sessoes.delete(token);
        return false;
    }
    sessao.ultimoUso = Date.now();
    return true;
}

function encerrarSessao(req, res) {
    const token = lerCookie(req, COOKIE);
    if (token) sessoes.delete(token);
    definirCookie(res, "", 0);
}

// Limpa sessões vencidas de tempos em tempos
setInterval(() => {
    const agora = Date.now();
    for (const [token, sessao] of sessoes) {
        if (agora - sessao.ultimoUso > DURACAO_MS) sessoes.delete(token);
    }
}, 60 * 60 * 1000).unref();

/* ================= Limite de tentativas de login ================= */

/*
 * O sistema só aceita conexões desta máquina, então todas as tentativas vêm do mesmo IP:
 * o limite é por instalação. Depois de 5 erros seguidos, bloqueia por 30 s, dobrando a cada
 * novo erro (até 15 min). Um login certo zera a contagem.
 */
const ERROS_LIVRES = 5;
const BLOQUEIO_INICIAL_MS = 30 * 1000;
const BLOQUEIO_MAXIMO_MS = 15 * 60 * 1000;
const LOGINS_SIMULTANEOS = 2;

const tentativas = { erros: 0, bloqueadoAte: 0, emAndamento: 0 };

// Segundos que ainda faltam de bloqueio (0 = pode tentar)
function segundosBloqueado() {
    return Math.max(0, Math.ceil((tentativas.bloqueadoAte - Date.now()) / 1000));
}

function registrarErroLogin() {
    tentativas.erros += 1;
    if (tentativas.erros >= ERROS_LIVRES) {
        const vezes = tentativas.erros - ERROS_LIVRES;
        const duracao = Math.min(BLOQUEIO_MAXIMO_MS, BLOQUEIO_INICIAL_MS * 2 ** vezes);
        tentativas.bloqueadoAte = Date.now() + duracao;
    }
}

function registrarAcertoLogin() {
    tentativas.erros = 0;
    tentativas.bloqueadoAte = 0;
}

// Evita que muitos logins ao mesmo tempo ocupem o servidor
function reservarLogin() {
    if (tentativas.emAndamento >= LOGINS_SIMULTANEOS) return false;
    tentativas.emAndamento += 1;
    return true;
}

function liberarLogin() {
    tentativas.emAndamento = Math.max(0, tentativas.emAndamento - 1);
}

module.exports = {
    exigirHostLocal,
    cabecalhosSeguranca,
    criarSessao,
    sessaoValida,
    encerrarSessao,
    segundosBloqueado,
    registrarErroLogin,
    registrarAcertoLogin,
    reservarLogin,
    liberarLogin,
};
