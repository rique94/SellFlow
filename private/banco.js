/*
 * Banco de dados do SellFlow.
 * - Com DATABASE_URL (nuvem): Postgres, pelo driver pg.
 * - Sem DATABASE_URL (computador): PGlite, um Postgres que roda dentro do próprio Node e guarda
 *   os dados em private/data/banco. Não precisa instalar nada.
 * O resto do sistema usa só consulta() e transacao(), que funcionam igual nos dois casos.
 */
const path = require("path");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS lojas (
    id         SERIAL PRIMARY KEY,
    login      TEXT NOT NULL,
    tel        TEXT NOT NULL,
    pwd        TEXT NOT NULL,
    nome       TEXT NOT NULL,
    dados      JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lojas_login_unico ON lojas (lower(login));
CREATE UNIQUE INDEX IF NOT EXISTS lojas_tel_unico ON lojas (tel);

-- Pedido com arquivado_em preenchido = está nos finalizados (ver ciclo.js)
CREATE TABLE IF NOT EXISTS pedidos (
    loja_id      INTEGER NOT NULL REFERENCES lojas (id) ON DELETE CASCADE,
    numero       INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 999),
    dados        JSONB NOT NULL,
    arquivado_em TIMESTAMPTZ,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (loja_id, numero)
);
CREATE INDEX IF NOT EXISTS pedidos_por_loja ON pedidos (loja_id, criado_em);

-- Guarda só o hash do token: quem ler o banco não consegue entrar como a loja
CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    loja_id    INTEGER NOT NULL REFERENCES lojas (id) ON DELETE CASCADE,
    ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessoes_ultimo_uso ON sessoes (ultimo_uso);
`;

let motor = null;

function conectarPostgres() {
    const { Pool } = require("pg");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PG_POOL_MAX) || 10,
    });
    pool.on("error", (error) => console.error("Erro na conexão com o banco:", error.message));

    return {
        nome: "Postgres",
        consulta: async (sql, parametros) => (await pool.query(sql, parametros)).rows,
        transacao: async (funcao) => {
            const cliente = await pool.connect();
            try {
                await cliente.query("BEGIN");
                const resultado = await funcao({
                    consulta: async (sql, parametros) => (await cliente.query(sql, parametros)).rows,
                });
                await cliente.query("COMMIT");
                return resultado;
            } catch (error) {
                await cliente.query("ROLLBACK").catch(() => {});
                throw error;
            } finally {
                cliente.release();
            }
        },
        executar: (sql) => pool.query(sql),
        fechar: () => pool.end(),
    };
}

async function conectarPglite() {
    let PGlite;
    try {
        ({ PGlite } = require("@electric-sql/pglite"));
    } catch {
        throw new Error("Defina DATABASE_URL ou rode npm install para usar o banco local (PGlite).");
    }
    // PGLITE_DIR=memory:// deixa o banco só na memória (útil para testes)
    const pasta = process.env.PGLITE_DIR || path.join(__dirname, "data", "banco");
    const db = new PGlite(pasta);
    await db.waitReady;

    return {
        nome: `banco local em ${pasta}`,
        consulta: async (sql, parametros) => (await db.query(sql, parametros)).rows,
        transacao: (funcao) =>
            db.transaction((tx) =>
                funcao({ consulta: async (sql, parametros) => (await tx.query(sql, parametros)).rows }),
            ),
        executar: (sql) => db.exec(sql),
        fechar: () => db.close(),
    };
}

async function iniciarBanco() {
    motor = process.env.DATABASE_URL ? conectarPostgres() : await conectarPglite();
    await motor.executar(ESQUEMA);
    return motor.nome;
}

function exigirMotor() {
    if (!motor) throw new Error("O banco de dados ainda não foi iniciado.");
    return motor;
}

module.exports = {
    iniciarBanco,
    consulta: (sql, parametros) => exigirMotor().consulta(sql, parametros),
    // Tudo dentro de funcao(tx) é gravado junto, ou nada é gravado
    transacao: (funcao) => exigirMotor().transacao(funcao),
    fecharBanco: () => (motor ? motor.fechar() : undefined),
};
