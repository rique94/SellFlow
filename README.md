# SellFlow

> Sistema de gerenciamento de pedidos e vendas para lojas.

O **SellFlow** organiza os pedidos de uma loja em um só lugar: cadastro de pedidos, acompanhamento por status, impressão de etiquetas de despacho, registro de trocas de peça e métricas de vendas.

É um site na nuvem: **cada loja cria a sua conta** e vê apenas os próprios pedidos.

## Status

**Versão 2.0 em desenvolvimento:** migração de instalação local para site na nuvem com várias lojas.

## Funcionalidades

- **Cadastro de lojas:** qualquer loja cria a sua conta. O CNPJ e o telefone são validados e o CEP é consultado no ViaCEP para preencher o endereço. Usuário e telefone não se repetem entre lojas.
- **Login** por usuário ou telefone, com sessão de 12 horas e bloqueio temporário depois de várias senhas erradas.
- **Pedidos:** criar, editar e excluir pedidos com várias peças, tamanho, quantidade, valor e frete. Cada loja tem a própria numeração (1 a 999).
- **Status do pedido:** 🔴 Pagar · 🟡 Retirar · 🟣 Pagar local · 🔵 Despachar · 🟦 Despachado · ✅ Finalizado.
- **Lista de pedidos** com busca por nome ou telefone e filtros por status. Os pedidos em andamento aparecem primeiro e os concluídos no final.
- **Impressão:** etiqueta de despacho (destinatário e remetente) ou ficha completa do pedido.
- **Trocas de peça:** histórico de trocas registrado na tela de detalhes do pedido.
- **Arquivo de finalizados:** os pedidos concluídos antigos saem da lista sozinhos (veja abaixo).
- **Métricas:** vendas concluídas, totais, a pagar, a retirar e a despachar, com gráficos por período e comparação com o período anterior.

## Arquivo de finalizados

O sistema verifica os pedidos sozinho: ao iniciar, de hora em hora e sempre que a lista é aberta.

1. Um pedido concluído (Finalizado ou Despachado) fica na lista por 30 dias contados da última movimentação: conclusão, troca de peça ou edição.
2. Se passar 30 dias sem troca nem mudança, ele vai para o arquivo de finalizados, guardado por precaução (botão **🗄 Arquivados** na lista de pedidos).
3. No arquivo, ele fica mais 30 dias e depois é apagado de vez.
4. Registrar uma troca ou editar um pedido arquivado o devolve para a lista, e o prazo recomeça.

Pedidos em andamento (Pagar, Retirar, Pagar local e Despachar) nunca são arquivados.

## Tecnologias

- **Node.js** + **Express 5** no servidor
- **PostgreSQL** para guardar os dados (no computador, o [PGlite](https://pglite.dev/) roda um Postgres dentro do próprio Node, sem instalar nada)
- **HTML, CSS e JavaScript** puros no navegador (sem frameworks)
- Hospedagem no **[Railway](https://railway.com/)**

## Rodar no computador (desenvolvimento)

Requisito: [Node.js](https://nodejs.org/) **20 ou mais recente**.

```bash
git clone https://github.com/rique94/SellFlow.git
cd SellFlow
npm install
npm start
```

Depois, abra **http://localhost:3000** no navegador e cadastre uma loja.

Sem a variável `DATABASE_URL`, os dados ficam num banco local em `private/data/banco/` (fora do Git). Para começar do zero, desligue o servidor e apague essa pasta.

Para usar outra porta, defina `PORT` (por exemplo, `PORT=4000`). No computador, o servidor só aceita conexões da própria máquina.

### Testes

```bash
npm test
```

Os testes sobem a API com um banco só na memória e conferem cadastro, login, pedidos, arquivamento e, principalmente, que uma loja nunca vê os pedidos de outra.

## Publicar no Railway

1. Envie o código para o GitHub.
2. No Railway, crie um projeto com **Deploy from GitHub repo** e escolha o repositório do SellFlow.
3. No mesmo projeto, adicione um banco: **+ New → Database → PostgreSQL**.
4. No serviço do SellFlow, aba **Variables**, crie `DATABASE_URL` com o valor `${{Postgres.DATABASE_URL}}`.
5. Na aba **Settings → Networking**, clique em **Generate Domain** para ganhar um endereço `*.up.railway.app`.

O Railway roda `npm install` e `npm start` sozinho. Na primeira vez, o servidor cria as tabelas no banco. Cada push no GitHub publica uma versão nova.

### Variáveis de ambiente

| Variável       | Obrigatória | Para que serve                                                                 |
| -------------- | ----------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL` | Sim         | Conexão com o Postgres                                                         |
| `PORT`         | Não         | Porta do servidor (o Railway preenche sozinho)                                 |
| `APP_HOSTS`    | Não         | Domínios aceitos, separados por vírgula (ex.: `sellflow.com.br,www.sellflow.com.br`) |
| `TZ`           | Não         | Fuso dos horários dos pedidos (padrão `America/Sao_Paulo`)                      |

No Railway, o servidor percebe sozinho que está em produção: aceita conexões da internet, manda o cookie de sessão só por HTTPS e ativa o HSTS. Fora do Railway, defina `NODE_ENV=production`.

## Banco de dados

| Tabela    | Conteúdo                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `lojas`   | Dados de cada loja e senha (guardada como hash scrypt)                    |
| `pedidos` | Pedidos de todas as lojas, separados por `loja_id`. Os finalizados têm `arquivado_em` preenchido |
| `sessoes` | Sessões de login (só o hash do token, nunca o token)                     |

O esquema fica em [`private/banco.js`](private/banco.js) e é criado sozinho ao iniciar.

**Esqueceu a senha?** Ainda não existe recuperação automática (seria preciso enviar e-mail ou SMS). Por enquanto, a senha precisa ser redefinida direto no banco.

## Estrutura

```text
SellFlow/
├── private/                 (servidor)
│   ├── app.js               (rotas, páginas e API)
│   ├── banco.js             (conexão com o Postgres ou o PGlite e esquema das tabelas)
│   ├── cadastro.js          (validação do cadastro, CEP e hash de senha)
│   ├── ciclo.js             (regras do arquivo de finalizados)
│   ├── config.js            (variáveis de ambiente)
│   ├── dados.js             (lojas e pedidos no banco)
│   └── seguranca.js         (sessão, limites de tentativas e cabeçalhos de segurança)
│
├── public/                  (navegador)
│   ├── images/
│   ├── pages/               (cadastro, dashboard, detalhes-pedido, metricas, novo-pedido)
│   ├── scripts/
│   ├── styles/
│   ├── favicon.svg
│   └── index.html           (tela de login)
│
├── test/                    (testes da API)
├── package.json
└── README.md
```

## Segurança

- **Lojas isoladas:** a loja vem sempre da sessão, nunca de um parâmetro da URL. Toda consulta de pedido filtra pela loja logada.
- **Senhas:** guardadas como hash (scrypt), nunca enviadas ao navegador.
- **Sessão:** cookie `HttpOnly`, `SameSite=Strict` e `Secure` (só HTTPS). No banco fica só o hash do token.
- **Login:** bloqueio temporário depois de várias senhas erradas, contado por usuário e por IP.
- **Limites:** número máximo de cadastros e de consultas de CEP por IP.
- **Origem:** pedidos que alteram dados só são aceitos quando vêm das páginas do próprio site.
- **Cabeçalhos:** CSP, HSTS, proteção contra iframes e outros.
- **Concorrência:** cada ação trava os dados da loja até terminar, então dois pedidos criados ao mesmo tempo nunca recebem o mesmo número.

## Licença

Este projeto está sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE).

---

**SellFlow** — Simplificando o gerenciamento de vendas.
