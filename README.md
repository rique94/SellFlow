# SellFlow

> Sistema de gerenciamento de pedidos e vendas para lojas.

O **SellFlow** organiza os pedidos de uma loja em um só lugar: cadastro de pedidos, acompanhamento por status, impressão de etiquetas de despacho, registro de trocas de peça e métricas de vendas.

É um site na nuvem: **cada loja cria a sua conta** e vê apenas os próprios pedidos.

## Status

**Versão 2.0 em desenvolvimento:** migração de instalação local para site na nuvem com várias lojas.

## Funcionalidades

- **Cadastro de lojas:** qualquer loja cria a sua conta. O CNPJ e o telefone são validados e o CEP é consultado no ViaCEP para preencher o endereço. Usuário, telefone e e-mail não se repetem entre lojas.
- **Login** por usuário ou telefone, com sessão de 12 horas e bloqueio temporário depois de várias senhas erradas.
- **Recuperação de senha por e-mail:** a loja recebe um link que vale por 1 hora e só pode ser usado uma vez.
- **Minha loja:** mostra os dados da conta, permite cadastrar ou trocar o e-mail de recuperação (pede a senha atual e avisa o e-mail antigo) e trocar a senha (as sessões em outros aparelhos são encerradas e a loja recebe um aviso por e-mail). O painel de pedidos lembra a loja de cadastrar o e-mail enquanto ela não tiver um.
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
- Hospedagem gratuita: site no **[Render](https://render.com/)** e banco no **[Neon](https://neon.tech/)**

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

## Publicar de graça (Render + Neon)

O site roda no plano gratuito do **Render** e o banco no plano gratuito do **Neon** (o Postgres gratuito do Render é apagado depois de 30 dias; o do Neon não vence).

**1. Banco no Neon**

1. Crie uma conta em [neon.tech](https://neon.tech) (pode entrar com o GitHub).
2. Crie um projeto chamado `sellflow`, com Postgres na região **AWS US East (N. Virginia)**, perto do Render.
3. Clique em **Connect** e copie o endereço de conexão (começa com `postgresql://`).

**2. Site no Render**

1. Crie uma conta em [render.com](https://render.com) entrando com o GitHub.
2. Clique em **New → Blueprint** e escolha o repositório do SellFlow. O Render lê o arquivo [`render.yaml`](render.yaml).
3. Quando ele pedir, cole o endereço do Neon em `DATABASE_URL`. `RESEND_API_KEY` e `EMAIL_FROM` podem ficar vazios por enquanto.
4. Clique em **Apply**. Em poucos minutos o site fica no ar em `https://sellflow.onrender.com` (ou um endereço parecido).

Na primeira vez, o servidor cria as tabelas no banco. Cada push na `main` publica uma versão nova.

**Limites do plano gratuito:**

- O site "dorme" depois de 15 minutos sem visitas. A primeira visita depois disso leva cerca de 1 minuto para abrir.
- O Neon guarda até 1 GB e dorme depois de 5 minutos parado (acorda em menos de 1 segundo). Se passar do limite de uso do mês, o banco pausa até o mês seguinte, sem perder dados.

### Variáveis de ambiente

| Variável       | Obrigatória | Para que serve                                                                 |
| -------------- | ----------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL` | Sim         | Conexão com o Postgres                                                         |
| `PORT`         | Não         | Porta do servidor (a hospedagem preenche sozinha)                              |
| `APP_HOSTS`    | Não         | Domínios aceitos, separados por vírgula (ex.: `sellflow.com.br,www.sellflow.com.br`) |
| `TZ`           | Não         | Fuso dos horários dos pedidos (padrão `America/Sao_Paulo`)                      |
| `RESEND_API_KEY` | Para recuperar senha | Chave do [Resend](https://resend.com), que envia os e-mails             |
| `EMAIL_FROM`   | Para recuperar senha | Remetente dos e-mails (ex.: `SellFlow <nao-responda@sellflow.com.br>`)   |
| `APP_URL`      | Não         | Endereço do site nos links dos e-mails (padrão: o domínio da hospedagem)          |

No Render (e no Railway), o servidor percebe sozinho que está em produção: aceita conexões da internet, manda o cookie de sessão só por HTTPS e ativa o HSTS. Em outra hospedagem, defina `NODE_ENV=production`.

## Banco de dados

| Tabela    | Conteúdo                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `lojas`   | Dados de cada loja e senha (guardada como hash scrypt)                    |
| `pedidos` | Pedidos de todas as lojas, separados por `loja_id`. Os finalizados têm `arquivado_em` preenchido |
| `sessoes` | Sessões de login (só o hash do token, nunca o token)                     |
| `redefinicoes_senha` | Links de redefinição de senha (só o hash, com prazo e uso único) |

O esquema fica em [`private/banco.js`](private/banco.js) e é criado sozinho ao iniciar.

### E-mails de recuperação de senha

1. Crie uma conta no [Resend](https://resend.com) (o plano gratuito envia até 3.000 e-mails por mês).
2. Em **Domains**, adicione o domínio da loja ou do SellFlow e crie os registros DNS que ele mostrar.
3. Em **API Keys**, crie uma chave e coloque em `RESEND_API_KEY` no Render (**Environment** do serviço).
4. Defina `EMAIL_FROM` com um endereço desse domínio, por exemplo `SellFlow <nao-responda@seudominio.com.br>`.

Sem domínio verificado, o Resend só entrega para o e-mail da própria conta do Resend (bom para testar). Se o site usar um domínio próprio, defina também `APP_URL` (ex.: `https://sellflow.com.br`) para os links apontarem para ele.

No computador, sem `RESEND_API_KEY`, o e-mail aparece no terminal em vez de ser enviado.

## Estrutura

```text
SellFlow/
├── private/                 (servidor)
│   ├── app.js               (rotas, páginas e API)
│   ├── banco.js             (conexão com o Postgres ou o PGlite e esquema das tabelas)
│   ├── cadastro.js          (validação do cadastro, CEP e hash de senha)
│   ├── ciclo.js             (regras do arquivo de finalizados)
│   ├── config.js            (variáveis de ambiente)
│   ├── dados.js             (lojas, pedidos e redefinição de senha no banco)
│   ├── email.js             (envio de e-mails pelo Resend)
│   └── seguranca.js         (sessão, limites de tentativas e cabeçalhos de segurança)
│
├── public/                  (navegador)
│   ├── images/
│   ├── pages/               (cadastro, conta, dashboard, detalhes-pedido, metricas, novo-pedido,
│   │                         recuperar-senha, redefinir-senha)
│   ├── scripts/
│   ├── styles/
│   ├── favicon.svg
│   └── index.html           (tela de login)
│
├── test/                    (testes da API)
├── package.json
├── render.yaml              (configuração do site no Render)
└── README.md
```

## Segurança

- **Lojas isoladas:** a loja vem sempre da sessão, nunca de um parâmetro da URL. Toda consulta de pedido filtra pela loja logada.
- **Senhas:** guardadas como hash (scrypt), nunca enviadas ao navegador.
- **Sessão:** cookie `HttpOnly`, `SameSite=Strict` e `Secure` (só HTTPS). No banco fica só o hash do token.
- **Login:** bloqueio temporário depois de várias senhas erradas, contado por usuário e por IP.
- **Recuperação de senha:** a resposta é a mesma exista ou não uma loja com o e-mail (ninguém descobre quais e-mails têm conta). O link usa um token aleatório guardado só como hash, vale por 1 hora e uma vez só, não é montado a partir do endereço da requisição e, ao ser usado, encerra todas as sessões da loja.
- **Limites:** número máximo de cadastros e de consultas de CEP por IP.
- **Origem:** pedidos que alteram dados só são aceitos quando vêm das páginas do próprio site.
- **Cabeçalhos:** CSP, HSTS, proteção contra iframes e outros.
- **Concorrência:** cada ação trava os dados da loja até terminar, então dois pedidos criados ao mesmo tempo nunca recebem o mesmo número.

## Licença

Este projeto está sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE).

---

**SellFlow** — Simplificando o gerenciamento de vendas.
