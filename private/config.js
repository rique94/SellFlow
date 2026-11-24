/*
 * Configuração por variáveis de ambiente.
 *
 * Na nuvem (Railway) o servidor detecta sozinho que está em produção. Variáveis:
 * - DATABASE_URL  conexão do Postgres (o Railway preenche ao ligar o banco ao serviço)
 * - PORT          porta (o Railway preenche)
 * - APP_HOSTS     opcional: domínios aceitos, separados por vírgula (ex.: sellflow.com.br,www.sellflow.com.br)
 * - TZ            fuso dos horários dos pedidos (padrão America/Sao_Paulo)
 *
 * No computador, sem DATABASE_URL, os dados ficam num Postgres local (PGlite) em private/data/banco.
 */

// Datas e horas dos pedidos sempre no horário de Brasília, mesmo num servidor em UTC
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

const NA_NUVEM =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN);

const listaHosts = (valor) =>
    String(valor || "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);

module.exports = {
    NA_NUVEM,
    PORT: Number(process.env.PORT) || 3000,
    // Na nuvem, só restringe o domínio se APP_HOSTS for definido; no computador, só localhost
    HOSTS_PERMITIDOS: NA_NUVEM ? listaHosts(process.env.APP_HOSTS) : ["localhost", "127.0.0.1", "[::1]"],
    // Quantos proxies ficam na frente do servidor (o Railway tem um)
    PROXIES_CONFIAVEIS: NA_NUVEM ? Number(process.env.TRUST_PROXY ?? 1) : 0,
};
