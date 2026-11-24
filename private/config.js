/*
 * Configuração por variáveis de ambiente.
 *
 * Na nuvem (Railway) o servidor detecta sozinho que está em produção. Variáveis:
 * - DATABASE_URL  conexão do Postgres (o Railway preenche ao ligar o banco ao serviço)
 * - PORT          porta (o Railway preenche)
 * - APP_HOSTS     opcional: domínios aceitos, separados por vírgula (ex.: sellflow.com.br,www.sellflow.com.br)
 * - TZ            fuso dos horários dos pedidos (padrão America/Sao_Paulo)
 * - RESEND_API_KEY chave do Resend, para enviar os e-mails de recuperação de senha
 * - EMAIL_FROM    remetente dos e-mails (ex.: SellFlow <nao-responda@sellflow.com.br>)
 * - APP_URL       endereço do site nos links dos e-mails (padrão: domínio do Railway)
 *
 * No computador, sem DATABASE_URL, os dados ficam num Postgres local (PGlite) em private/data/banco.
 */

// Datas e horas dos pedidos sempre no horário de Brasília, mesmo num servidor em UTC
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

const NA_NUVEM =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN);

const PORT = Number(process.env.PORT) || 3000;

/*
 * Endereço do site usado nos links dos e-mails. Nunca vem do cabeçalho Host da requisição:
 * um atacante poderia trocar o Host e receber o link de redefinição de outra loja.
 */
function urlDoSite() {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    return NA_NUVEM ? null : `http://localhost:${PORT}`;
}

const listaHosts = (valor) =>
    String(valor || "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);

module.exports = {
    NA_NUVEM,
    PORT,
    URL_DO_SITE: urlDoSite(),
    // E-mail (Resend): sem chave, no computador o e-mail é mostrado no terminal
    RESEND_API_KEY: process.env.RESEND_API_KEY || "",
    EMAIL_REMETENTE: process.env.EMAIL_FROM || "SellFlow <onboarding@resend.dev>",
    // Na nuvem, só restringe o domínio se APP_HOSTS for definido; no computador, só localhost
    HOSTS_PERMITIDOS: NA_NUVEM ? listaHosts(process.env.APP_HOSTS) : ["localhost", "127.0.0.1", "[::1]"],
    // Quantos proxies ficam na frente do servidor (o Railway tem um)
    PROXIES_CONFIAVEIS: NA_NUVEM ? Number(process.env.TRUST_PROXY ?? 1) : 0,
};
