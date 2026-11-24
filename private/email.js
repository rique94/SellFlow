/*
 * Envio de e-mails pelo Resend (https://resend.com), pela API HTTP: sem dependências e
 * funciona no Railway, que bloqueia SMTP nos planos mais baratos.
 * Sem RESEND_API_KEY: no computador, o e-mail aparece no terminal; na nuvem, só um aviso no log.
 */
const { NA_NUVEM, RESEND_API_KEY, EMAIL_REMETENTE } = require("./config");

async function enviarPeloResend({ para, assunto, texto, html }) {
    const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_REMETENTE, to: [para], subject: assunto, text: texto, html }),
        signal: AbortSignal.timeout(10000),
    });
    if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        throw new Error(`Resend respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`);
    }
}

async function mostrarNoTerminal({ para, assunto, texto }) {
    if (NA_NUVEM) {
        // Não escreve o conteúdo no log da nuvem: o link daria acesso à loja
        console.error(`RESEND_API_KEY não definida: o e-mail "${assunto}" não foi enviado.`);
        return;
    }
    console.log(`\n===== E-mail (não enviado: sem RESEND_API_KEY) =====\nPara: ${para}\nAssunto: ${assunto}\n\n${texto}\n=====\n`);
}

let transporte = RESEND_API_KEY ? enviarPeloResend : mostrarNoTerminal;

module.exports = {
    enviarEmail: (mensagem) => transporte(mensagem),
    // Usado nos testes para capturar os e-mails em vez de enviar
    trocarTransporte: (funcao) => {
        transporte = funcao;
    },
};
