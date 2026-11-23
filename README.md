# SellFlow

> Sistema de gerenciamento de vendas e pedidos para lojas.

O **SellFlow** é um sistema desenvolvido para facilitar o gerenciamento de vendas, pedidos e operações de lojas, oferecendo uma interface simples para organização e acompanhamento dos pedidos.

Cada instalação atende uma loja: no primeiro acesso, a loja é cadastrada pelo próprio sistema.

## Status

**Em desenvolvimento.**

Novas funcionalidades e melhorias estão sendo adicionadas ao projeto conforme seu desenvolvimento avança.

## Tecnologias

* **Node.js**
* **Express**
* **JavaScript**
* **HTML5**
* **CSS3**
* **JSON**

## Funcionalidades

* [ ] 

* [x] Criação de novos pedidos
* [x] Visualização de pedidos
* [ ] API REST com Express
* [x] Sistema de cadastro de lojas
* [ ] Autenticação de lojas
* [x] Gerenciamento de usuários
* [x] Banco de dados
* [x] Suporte completo a múltiplas lojas

## Estrutura

```text
SellFlow/
├── private/
│   ├── data/
│   │   ├── loja.json        (criado pelo cadastro, fora do git)
│   │   ├── pedidos.json     (criado automaticamente, fora do git)
│   │   └── finalizados.json (pedidos arquivados, fora do git)
│   │
│   ├── app.js
│   ├── cadastro.js
│   ├── ciclo.js             (regras de arquivamento dos pedidos)
│   └── seguranca.js
│
├── public/
│   ├── images/
│   │   ├── banknote-arrow-up.png
│   │   ├── check.png
│   │   ├── clock-arrow-down.png
│   │   └── gift.png
│   │
│   ├── pages/
│   │   ├── cadastro.html
│   │   ├── dashboard.html
│   │   ├── detalhes-pedido.html
│   │   └── novo-pedido.html
│   │
│   ├── scripts/
│   │   ├── cadastro.js
│   │   ├── dashboard.js
│   │   ├── detalhes-pedido.js
│   │   ├── log-in.js
│   │   └── novo-pedido.js
│   │
│   ├── styles/
│   │   ├── cadastro.css
│   │   ├── dashboard.css
│   │   ├── detalhes-pedido.css
│   │   ├── log-in.css
│   │   ├── novo-pedido.css
│   │   └── style.css
│   │
│   ├── favicon.svg
│   └── index.html
│
├── package.json
└── README.md
```

> A estrutura do projeto pode mudar conforme o desenvolvimento.

## Instalação

Clone o repositório:

```bash
git clone https://github.com/rique94/SellFlow.git
```

Entre na pasta:

```bash
cd SellFlow
```

Instale as dependências:

```bash
npm install express
```

Inicie o servidor:

```bash
node .
```

## Arquivo de finalizados

O sistema verifica os pedidos sozinho (ao iniciar, de hora em hora e sempre que a lista é aberta):

1. Um pedido concluído (Finalizado ou Despachado) fica na lista por 30 dias desde a última movimentação: conclusão, troca de peça ou edição.
2. Se passar 30 dias sem troca nem mudança, ele vai para `finalizados.json`, guardado por precaução (botão **Arquivados** na lista de pedidos).
3. No arquivo, ele fica mais 30 dias e depois é apagado de vez.
4. Registrar uma troca ou editar um pedido arquivado o devolve para a lista e o prazo recomeça.

Pedidos em andamento (Pagar, Retirar, Despachar...) nunca são arquivados. As trocas são registradas na tela de detalhes do pedido.

## API

O SellFlow utiliza uma API desenvolvida com **Node.js e Express** para realizar a comunicação entre o frontend e o backend.

A API é responsável pelo gerenciamento dos dados e pela comunicação com os recursos do sistema.

A documentação dos endpoints será adicionada conforme a API for estruturada.

## Segurança

Informações sensíveis, como credenciais, tokens e dados reais de clientes, **não devem ser armazenadas no repositório**.

Durante o desenvolvimento, dados fictícios podem ser utilizados para testes.

## Roadmap

* [x] Estrutura inicial do sistema
* [x] API inicial
* [ ] Gerenciamento básico de pedidos
* [X] Sistema de lojas
* [x] login
* [ ] Autenticação e autorização
* [x] Banco de dados
* [ ] Melhorias na interface
* [ ] Deploy
* [x] Suporte completo a múltiplas lojas

## Licença

Este projeto está sob a licença **MIT**.

Consulte o arquivo [`LICENSE`](LICENSE) para mais informações.

---

**SellFlow** — Simplificando o gerenciamento de vendas online.
