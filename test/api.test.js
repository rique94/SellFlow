/*
 * Testes da API com um banco só na memória (PGlite). Rode com: npm test
 * O cadastro consulta o ViaCEP; sem internet, o CEP não é conferido e os testes passam do mesmo jeito.
 */
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { app, preparar } = require("../private/app");
const { consulta, fecharBanco } = require("../private/banco");
const { naLoja } = require("../private/dados");

let servidor;
let base;

before(async () => {
    await preparar();
    servidor = http.createServer(app);
    await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
    await new Promise((resolve) => servidor.close(resolve));
    await fecharBanco();
});

// Navegador simplificado: guarda o cookie de sessão entre as requisições
function navegador() {
    let cookie = "";
    return async function pedir(metodo, caminho, corpo, cabecalhos = {}) {
        const resposta = await fetch(base + caminho, {
            method: metodo,
            redirect: "manual",
            headers: {
                ...(corpo ? { "Content-Type": "application/json" } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...cabecalhos,
            },
            body: corpo ? JSON.stringify(corpo) : undefined,
        });
        const definido = resposta.headers.get("set-cookie");
        if (definido) cookie = definido.split(";")[0];
        const texto = await resposta.text();
        let json = null;
        try {
            json = JSON.parse(texto);
        } catch {
            // páginas e redirecionamentos não são JSON
        }
        return { status: resposta.status, json, headers: resposta.headers };
    };
}

const cadastro = (extra) => ({
    nomeLoja: "Loja Teste",
    telefone: "(11) 98765-4321",
    cep: "01310-100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
    login: "lojaA",
    senha: "senha1234",
    confirmarSenha: "senha1234",
    ...extra,
});

const pedido = (extra) => ({
    cliente: { nome: "Maria", telefone: "11999998888" },
    status: "🔴Pagar",
    listaPedidos: [{ desc_peca: "Camiseta", qtd_peca: "2", valor_peca: "49.90" }],
    ...extra,
});

const lojaA = navegador();
const lojaB = navegador();
const visitante = navegador();

test("cadastra duas lojas e recusa usuário ou telefone repetidos", async () => {
    let r = await visitante("POST", "/api/cadastro", cadastro());
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.loja.pwd, undefined, "a senha nunca vai para o navegador");
    assert.equal(r.json.loja.id, undefined, "o id interno não vai para o navegador");

    r = await visitante("POST", "/api/cadastro", cadastro({ login: "lojaB", telefone: "(21) 98765-4321", nomeLoja: "Loja B" }));
    assert.equal(r.status, 201, JSON.stringify(r.json));

    r = await visitante("POST", "/api/cadastro", cadastro({ login: "LOJAA", telefone: "(31) 98765-4321" }));
    assert.equal(r.status, 409);
    assert.equal(r.json.campo, "login");

    r = await visitante("POST", "/api/cadastro", cadastro({ login: "lojaC" }));
    assert.equal(r.status, 409);
    assert.equal(r.json.campo, "telefone");
});

test("login por usuário (sem diferenciar maiúsculas) e por telefone com máscara", async () => {
    assert.equal((await visitante("POST", "/api/login", { usr: "lojaA", pwd: "errada123" })).status, 401);
    assert.equal((await lojaA("POST", "/api/login", { usr: "LojaA", pwd: "senha1234" })).status, 200);
    assert.equal((await lojaB("POST", "/api/login", { usr: "(21) 98765-4321", pwd: "senha1234" })).status, 200);

    const r = await lojaB("GET", "/api/loja");
    assert.equal(r.json.usrName, "Loja B");
});

test("sem login a API responde 401 e as páginas voltam para a entrada", async () => {
    assert.equal((await visitante("GET", "/api/pedidos")).status, 401);
    assert.equal((await visitante("GET", "/api/loja")).status, 401);
    const pagina = await visitante("GET", "/dashboard");
    assert.equal(pagina.status, 302);
    assert.equal(pagina.headers.get("location"), "/");
});

test("cada loja só vê e altera os próprios pedidos", async () => {
    assert.equal((await lojaA("POST", "/api/pedidos", pedido())).json.pedido.id, 1);
    assert.equal((await lojaA("POST", "/api/pedidos", pedido())).json.pedido.id, 2);
    assert.equal((await lojaB("POST", "/api/pedidos", pedido({ cliente: { nome: "João", telefone: "21999998888" } }))).json.pedido.id, 1);

    assert.equal((await lojaA("GET", "/api/pedidos")).json.length, 2);
    const daB = await lojaB("GET", "/api/pedidos");
    assert.equal(daB.json.length, 1);
    assert.equal(daB.json[0].cliente.nome, "João");

    // O pedido 2 só existe na loja A
    assert.equal((await lojaB("GET", "/api/pedidos/2")).status, 404);
    assert.equal((await lojaB("PUT", "/api/pedidos/2", pedido())).status, 404);
    assert.equal((await lojaB("DELETE", "/api/pedidos/2")).status, 404);
    assert.equal((await lojaA("GET", "/api/pedidos/2")).status, 200);
});

test("pedidos criados ao mesmo tempo recebem números diferentes", async () => {
    const respostas = await Promise.all(Array.from({ length: 10 }, () => lojaA("POST", "/api/pedidos", pedido())));
    const ids = respostas.map((r) => r.json.pedido.id);
    assert.equal(new Set(ids).size, 10, `ids repetidos: ${ids}`);
    assert.equal((await lojaA("GET", "/api/pedidos")).json.length, 12);
});

test("editar, registrar troca e excluir", async () => {
    let r = await lojaA("PUT", "/api/pedidos/1", pedido({ status: "✅Finalizado" }));
    assert.equal(r.status, 200);
    assert.ok(r.json.pedido.dataConclusao);
    assert.equal(r.json.pedido.ciclo.fase, "concluido");

    r = await lojaA("POST", "/api/pedidos/1/trocas", { descricao: "Trocou M por G" });
    assert.equal(r.status, 201);
    assert.equal(r.json.pedido.trocas.length, 1);

    assert.equal((await lojaA("DELETE", "/api/pedidos/2")).status, 200);
    assert.equal((await lojaA("GET", "/api/pedidos/2")).status, 404);
});

test("concluído parado há 30 dias vai para os finalizados, volta ao editar e some 30 dias depois", async () => {
    const [{ id: lojaId }] = await consulta("SELECT id FROM lojas WHERE login = 'lojaA'");
    const dia = 24 * 60 * 60 * 1000;
    const daqui = (dias) => new Date(Date.now() + dias * dia);

    const em31 = await naLoja(lojaId, (loja) => loja.arquivados.map((p) => p.id), daqui(31));
    assert.deepEqual(em31, [1]);
    assert.equal((await lojaA("GET", "/api/pedidos/arquivados")).json.length, 1);

    // Editar traz de volta para a lista
    const r = await lojaA("PUT", "/api/pedidos/1", pedido({ status: "✅Finalizado" }));
    assert.equal(r.json.restaurado, true);
    assert.equal((await lojaA("GET", "/api/pedidos/arquivados")).json.length, 0);

    // Arquiva de novo e, 30 dias depois, apaga
    await naLoja(lojaId, () => {}, daqui(31));
    const em62 = await naLoja(lojaId, (loja) => loja.todos.some((p) => p.id === 1), daqui(62));
    assert.equal(em62, false);
});

test("pedido de outro site é recusado", async () => {
    const r = await lojaA("POST", "/api/pedidos", pedido(), { Origin: "https://site-malicioso.com" });
    assert.equal(r.status, 403);
});

test("sair encerra a sessão", async () => {
    assert.equal((await lojaB("POST", "/api/logout")).status, 200);
    assert.equal((await lojaB("GET", "/api/pedidos")).status, 401);
});

test("senha errada várias vezes bloqueia aquele usuário", async () => {
    const tentativa = () => visitante("POST", "/api/login", { usr: "lojaB", pwd: "errada123" });
    for (let i = 0; i < 4; i += 1) assert.equal((await tentativa()).status, 401);
    assert.equal((await tentativa()).status, 429);
});
