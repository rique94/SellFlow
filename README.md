# SellFlow

> Sistema de gerenciamento de vendas e pedidos para lojas.

O **SellFlow** é um sistema desenvolvido para facilitar o gerenciamento de vendas, pedidos e operações de lojas, oferecendo uma interface simples para organização e acompanhamento dos pedidos.

O projeto está sendo desenvolvido inicialmente para uso na **RB Outlet**, mas sua arquitetura está sendo planejada para permitir o gerenciamento de múltiplas lojas.

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
│   ├── data
│   │   ├── centroComercial
│   │   │   └── pedidos.json
│   │   │
│   │   ├── conde
│   │   │   └── pedidos.json
│   │   │
│   │   ├── centroComercial
│   │   │   └── pedidos.json
│   │   │
│   │   └── lojas.json
│   │
│   └── app.js
│
├── public/
│   ├── pages/
│   │   ├── dashboard.html
│   │   │
│   │   └── novo-pedido.html
│   │
│   ├── scipts/
│   │   ├── dashboard.js
│   │   │ 
│   │   ├── log-in.js
│   │   │
│   │   └── novo-pedido.js
│   │
│   ├── styles/
│   │   ├── log-in.css
│   │   │ 
│   │   ├── novo-pedido.css
│   │   │
│   │   └── style.css
│   │
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
