/*
 * Segurança do SellFlow: domínio e origem, cabeçalhos, sessão de login e limites de tentativas.
 */
const crypto = require("crypto");
const { consulta } = require("./banco");
const { NA_NUVEM, HOSTS_PERMITIDOS } = require("./config");

/* ================= Domínio e origem (contra DNS rebinding e CSRF) ================= */

function nomeDoHost(valor) {
    const host = String(valor || "").toLowerCase();
    // "[::1]:3000" -> "[::1]" | "localhost:3000" -> "localhost"
    return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

// Domínios conhecidos do próprio sistema (além do Host da requisição)
const HOSTS_DO_SISTEMA = new Set([...HOSTS_PERMITIDOS, process.env.RAILWAY_PUBLIC_DOMAIN].filter(Boolean));

function origemDoSistema(origem, req) {
    try {
        const url = new URL(origem);
        return url.host === req.host || HOSTS_DO_SISTEMA.has(nomeDoHost(url.host));
    } catch {
        return false;
    }
}

function protegerOrigem(req, res, next) {
    // No computador só aceita localhost; na nuvem, só os domínios de APP_HOSTS (quando definidos)
    if (HOSTS_PERMITIDOS.length > 0 && !HOSTS_PERMITIDOS.includes(nomeDoHost(req.host))) {
        return res.status(421).type("text/plain").send("Endereço não permitido.");
    }
    // Pedidos que alteram dados só podem vir das páginas do próprio sistema
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origem = req.headers.origin;
        const deOutroSite = req.headers["sec-fetch-site"] === "cross-site";
        if (deOutroSite || (origem && !origemDoSistema(origem, req))) {
            return res.status(403).json({ error: "Origem não permitida." });
        }
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
    if (NA_NUVEM) {
        // O navegador passa a usar só HTTPS neste domínio
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    if (req.path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
    }
    next();
}

/* ================= Sessão (guardada no banco) ================= */

const COOKIE = "sellflow_sessao";
const HORAS_SESSAO = 12; // 12 horas sem uso encerram a sessão

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function lerCookie(req, nome) {
    const cabecalho = req.headers.cookie || "";
    for (const parte of cabecalho.split(";")) {
        const [chave, ...resto] = parte.trim().split("=");
        if (chave === nome) return resto.join("=");
    }
    return null;
}

function definirCookie(res, valor, maxAgeSegundos) {
    // Secure: na nuvem o cookie só viaja por HTTPS
    const seguro = NA_NUVEM ? "; Secure" : "";
    res.append("Set-Cookie", `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSegundos}${seguro}`);
}

async function criarSessao(res, lojaId) {
    const token = crypto.randomBytes(32).toString("hex");
    await consulta("INSERT INTO sessoes (token_hash, loja_id) VALUES ($1, $2)", [hashToken(token), lojaId]);
    definirCookie(res, token, HORAS_SESSAO * 60 * 60);
}

// Id da loja logada neste navegador (null se não houver sessão válida). Cada uso renova o prazo.
async function lojaDaSessao(req) {
    if (req.lojaId !== undefined) return req.lojaId;
    const token = lerCookie(req, COOKIE);
    req.lojaId = null;
    if (token && /^[0-9a-f]{64}$/.test(token)) {
        const [sessao] = await consulta(
            `UPDATE sessoes SET ultimo_uso = now()
             WHERE token_hash = $1 AND ultimo_uso > now() - interval '${HORAS_SESSAO} hours'
             RETURNING loja_id`,
            [hashToken(token)],
        );
        req.lojaId = sessao ? sessao.loja_id : null;
    }
    return req.lojaId;
}

async function encerrarSessao(req, res) {
    const token = lerCookie(req, COOKIE);
    if (token) {
        await consulta("DELETE FROM sessoes WHERE token_hash = $1", [hashToken(token)]);
    }
    definirCookie(res, "", 0);
}

async function limparSessoesVencidas() {
    await consulta(`DELETE FROM sessoes WHERE ultimo_uso < now() - interval '${HORAS_SESSAO} hours'`);
}

/* ================= Limites de tentativas (na memória do servidor) ================= */

const MAXIMO_CHAVES = 10000; // memória limitada mesmo sob ataque: descarta as chaves mais antigas

function guardar(mapa, chave, valor) {
    mapa.delete(chave);
    mapa.set(chave, valor);
    if (mapa.size > MAXIMO_CHAVES) {
        mapa.delete(mapa.keys().next().value);
    }
}

/*
 * Erros de login seguidos: depois de `errosLivres`, bloqueia por 30 s, dobrando a cada novo
 * erro (até 15 min). Um login certo zera a contagem.
 */
function criarLimiteDeErros(errosLivres) {
    const BLOQUEIO_INICIAL_MS = 30 * 1000;
    const BLOQUEIO_MAXIMO_MS = 15 * 60 * 1000;
    const mapa = new Map();

    return {
        segundos(chave) {
            const estado = mapa.get(chave);
            return estado ? Math.max(0, Math.ceil((estado.bloqueadoAte - Date.now()) / 1000)) : 0;
        },
        erro(chave) {
            const estado = mapa.get(chave) || { erros: 0, bloqueadoAte: 0 };
            estado.erros += 1;
            estado.ultimoErro = Date.now();
            if (estado.erros >= errosLivres) {
                const duracao = Math.min(BLOQUEIO_MAXIMO_MS, BLOQUEIO_INICIAL_MS * 2 ** (estado.erros - errosLivres));
                estado.bloqueadoAte = Date.now() + duracao;
            }
            guardar(mapa, chave, estado);
        },
        acerto(chave) {
            mapa.delete(chave);
        },
        limpar() {
            const agora = Date.now();
            for (const [chave, estado] of mapa) {
                if (estado.bloqueadoAte < agora && agora - estado.ultimoErro > BLOQUEIO_MAXIMO_MS) mapa.delete(chave);
            }
        },
    };
}

// Por usuário: protege cada loja contra adivinhação de senha. Por IP: contra quem tenta muitas lojas.
// O limite por IP é mais folgado porque várias pessoas podem sair pela mesma rede.
const errosPorUsuario = criarLimiteDeErros(5);
const errosPorIp = criarLimiteDeErros(20);
const chaveUsuario = (usuario) => String(usuario || "").trim().toLowerCase().slice(0, 100);

function segundosBloqueado(ip, usuario) {
    return Math.max(errosPorIp.segundos(ip), errosPorUsuario.segundos(chaveUsuario(usuario)));
}

function registrarErroLogin(ip, usuario) {
    errosPorIp.erro(ip);
    errosPorUsuario.erro(chaveUsuario(usuario));
}

function registrarAcertoLogin(ip, usuario) {
    errosPorIp.acerto(ip);
    errosPorUsuario.acerto(chaveUsuario(usuario));
}

// Evita que muitos logins ao mesmo tempo ocupem o servidor (o hash da senha é pesado de propósito)
const LOGINS_SIMULTANEOS = 4;
let loginsEmAndamento = 0;

function reservarLogin() {
    if (loginsEmAndamento >= LOGINS_SIMULTANEOS) return false;
    loginsEmAndamento += 1;
    return true;
}

function liberarLogin() {
    loginsEmAndamento = Math.max(0, loginsEmAndamento - 1);
}

/**
 * Middleware: no máximo `limite` requisições por IP a cada `janelaMs` (ex.: cadastros, consultas de CEP).
 */
function limitarPorIp(limite, janelaMs, mensagem) {
    const mapa = new Map();
    setInterval(() => {
        const agora = Date.now();
        for (const [chave, janela] of mapa) {
            if (agora - janela.inicio > janelaMs) mapa.delete(chave);
        }
    }, janelaMs).unref();

    return (req, res, next) => {
        const agora = Date.now();
        let janela = mapa.get(req.ip);
        if (!janela || agora - janela.inicio > janelaMs) {
            janela = { inicio: agora, quantidade: 0 };
        }
        janela.quantidade += 1;
        guardar(mapa, req.ip, janela);
        if (janela.quantidade > limite) {
            const segundos = Math.max(1, Math.ceil((janela.inicio + janelaMs - agora) / 1000));
            res.setHeader("Retry-After", String(segundos));
            return res.status(429).json({ error: mensagem, espera: segundos });
        }
        next();
    };
}

// Limpa contagens e sessões vencidas de hora em hora
setInterval(() => {
    errosPorIp.limpar();
    errosPorUsuario.limpar();
    limparSessoesVencidas().catch((error) => console.error("Não foi possível limpar sessões vencidas:", error.message));
}, 60 * 60 * 1000).unref();

module.exports = {
    protegerOrigem,
    cabecalhosSeguranca,
    criarSessao,
    lojaDaSessao,
    encerrarSessao,
    limparSessoesVencidas,
    segundosBloqueado,
    registrarErroLogin,
    registrarAcertoLogin,
    reservarLogin,
    liberarLogin,
    limitarPorIp,
};
