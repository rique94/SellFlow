# SellFlow

> Sistema de gerenciamento de pedidos e vendas para lojas.

O **SellFlow** organiza os pedidos de uma loja em um só lugar: cadastro de pedidos, acompanhamento por status, impressão de etiquetas de despacho, registro de trocas de peça e métricas de vendas.

Cada instalação atende **uma loja** e roda **no próprio computador da loja**. No primeiro acesso, a loja é cadastrada pelo próprio sistema.

## Status

**Versão 1.0 em finalização.**

## Funcionalidades

- **Cadastro da loja** no primeiro acesso: o CNPJ e o telefone são validados e o CEP é consultado no ViaCEP para preencher o endereço.
- **Login** por usuário ou telefone, com sessão de 12 horas e bloqueio temporário depois de várias senhas erradas.
- **Pedidos:** criar, editar e excluir pedidos com várias peças, tamanho, quantidade, valor e frete.
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
- **HTML, CSS e JavaScript** puros no navegador (sem frameworks)
- **Arquivos JSON** para guardar os dados

## Requisitos

- [Node.js](https://nodejs.org/) **18 ou mais recente**
- Conexão com a internet só para consultar o CEP no cadastro (sem internet, o endereço pode ser preenchido à mão)

## Instalação

```bash
git clone https://github.com/rique94/SellFlow.git
cd SellFlow
npm install
npm start
```

Depois, abra **http://localhost:3000** no navegador e cadastre a loja.

Para usar outra porta, defina a variável `PORT` antes de iniciar o servidor (por exemplo, `PORT=4000`).

> O servidor só aceita conexões do próprio computador (`localhost`). Ele não fica acessível pela rede nem pela internet.

## Dados

Os dados ficam em `private/data/`. Esses arquivos são criados pelo sistema e **não vão para o Git**:

| Arquivo            | Conteúdo                                                |
| ------------------ | ------------------------------------------------------- |
| `loja.json`        | Dados da loja e senha (guardada como hash scrypt)        |
| `pedidos.json`     | Pedidos da lista                                        |
| `finalizados.json` | Pedidos arquivados (concluídos há mais de 30 dias)      |

**Backup:** para não perder os pedidos, copie a pasta `private/data/` de tempos em tempos.

**Esqueceu a senha?** Ainda não existe recuperação pela tela. Com o servidor desligado, apague `private/data/loja.json` e cadastre a loja de novo. Os pedidos não são apagados.

## Estrutura

```text
SellFlow/
├── private/                 (servidor)
│   ├── data/                (dados da loja, fora do Git)
│   ├── app.js               (rotas, páginas e API)
│   ├── cadastro.js          (validação do cadastro, CEP e hash de senha)
│   ├── ciclo.js             (regras do arquivo de finalizados)
│   └── seguranca.js         (sessão, limite de tentativas e cabeçalhos de segurança)
│
├── public/                  (navegador)
│   ├── images/
│   ├── pages/               (cadastro, dashboard, detalhes-pedido, metricas, novo-pedido)
│   ├── scripts/
│   ├── styles/
│   ├── favicon.svg
│   └── index.html           (tela de login)
│
├── package.json
└── README.md
```

## Segurança

- A senha é guardada como hash (scrypt) e nunca é enviada ao navegador.
- A sessão usa um cookie `HttpOnly` e `SameSite=Strict`.
- O login é bloqueado temporariamente depois de várias senhas erradas.
- O servidor aceita apenas acessos locais e envia cabeçalhos de segurança (CSP, proteção contra iframes etc.).
- Dados reais da loja e dos clientes ficam fora do repositório (`.gitignore`).

## Licença

Este projeto está sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE).

---

**SellFlow** — Simplificando o gerenciamento de vendas.
