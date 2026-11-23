/*
 * Ciclo de vida dos pedidos concluídos (✅Finalizado ou 🟦Despachado):
 *
 * 1. O pedido concluído fica na lista (pedidos.json) por 30 dias contados da última movimentação:
 *    criação, conclusão, troca de peça registrada ou edição do pedido.
 * 2. Se passar 30 dias sem troca nem mudança, ele vai para finalizados.json (guardado por precaução).
 * 3. Em finalizados.json ele fica mais 30 dias e depois é apagado de vez.
 * 4. Registrar uma troca ou editar um pedido arquivado o traz de volta para a lista (o prazo recomeça).
 *
 * Pedidos ainda em andamento (Pagar, Retirar, Despachar...) nunca são arquivados automaticamente.
 */

const DIAS_NA_LISTA = 30;
const DIAS_ARQUIVADO = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

function isConcluido(status) {
    return status === "✅Finalizado" || status === "🟦Despachado";
}

// "22/11/2026" + "14:05" -> Date (null se inválida)
function dataBr(data, hora) {
    const [d, m, a] = String(data || "").split("/").map(Number);
    if (!d || !m || !a) return null;
    const [h, min] = String(hora || "00:00").split(":").map(Number);
    const resultado = new Date(a, m - 1, d, h || 0, min || 0);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
}

function dataIso(valor) {
    if (typeof valor !== "string" || !valor) return null;
    const resultado = new Date(valor);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
}

const somarDias = (data, dias) => new Date(data.getTime() + dias * DIA_MS);
const diasAte = (alvo, agora) => Math.max(0, Math.ceil((alvo - agora) / DIA_MS));
const trocasDo = (pedido) => (Array.isArray(pedido.trocas) ? pedido.trocas : []);

// Data mais recente entre criação, conclusão, última edição e última troca
function ultimaMovimentacao(pedido) {
    const datas = [
        dataBr(pedido.data, pedido.hora),
        dataBr(pedido.dataConclusao, pedido.horaConclusao),
        dataIso(pedido.atualizadoEm),
        ...trocasDo(pedido).map((troca) => dataIso(troca.em)),
    ].filter(Boolean);
    return datas.length ? new Date(Math.max(...datas)) : null;
}

/**
 * Situação do pedido no ciclo (não é salva, só enviada para as telas):
 * - "em-andamento": ainda não concluído, não sai da lista;
 * - "concluido": concluído, vai para o arquivo em `arquivaEm` se não houver troca nem mudança;
 * - "arquivado": em finalizados.json, será apagado em `apagaEm`.
 */
function infoCiclo(pedido, arquivado, agora = new Date()) {
    const trocas = trocasDo(pedido).length;
    if (arquivado) {
        const desde = dataIso(pedido.arquivadoEm) || agora;
        const apagaEm = somarDias(desde, DIAS_ARQUIVADO);
        return {
            fase: "arquivado",
            trocas,
            arquivadoEm: desde.toISOString(),
            apagaEm: apagaEm.toISOString(),
            diasRestantes: diasAte(apagaEm, agora),
        };
    }
    if (!isConcluido(pedido.status)) {
        return { fase: "em-andamento", trocas };
    }
    const ultima = ultimaMovimentacao(pedido) || agora;
    const arquivaEm = somarDias(ultima, DIAS_NA_LISTA);
    return {
        fase: "concluido",
        trocas,
        ultimaMovimentacao: ultima.toISOString(),
        arquivaEm: arquivaEm.toISOString(),
        diasRestantes: diasAte(arquivaEm, agora),
    };
}

/**
 * Aplica as regras de prazo às duas listas.
 * Retorna as listas novas, quantos pedidos foram arquivados/apagados e se algo mudou.
 */
function verificarPrazos(pedidos, arquivados, agora = new Date()) {
    const idsNaLista = new Set(pedidos.map((pedido) => Number(pedido.id)));
    const ficam = [];
    const vaoParaArquivo = [];

    for (const pedido of pedidos) {
        const ciclo = infoCiclo(pedido, false, agora);
        if (ciclo.fase === "concluido" && new Date(ciclo.arquivaEm) <= agora) {
            vaoParaArquivo.push({ ...pedido, arquivadoEm: agora.toISOString() });
        } else {
            ficam.push(pedido);
        }
    }

    let apagados = 0;
    let mudou = vaoParaArquivo.length > 0;
    const arquivoAtual = [];
    for (const pedido of arquivados) {
        // Sobra de uma restauração interrompida: a cópia da lista é a que vale
        if (idsNaLista.has(Number(pedido.id))) {
            mudou = true;
            continue;
        }
        // Arquivado sem data (editado à mão): o prazo começa agora
        if (!dataIso(pedido.arquivadoEm)) {
            arquivoAtual.push({ ...pedido, arquivadoEm: agora.toISOString() });
            mudou = true;
            continue;
        }
        if (new Date(infoCiclo(pedido, true, agora).apagaEm) <= agora) {
            apagados += 1;
            mudou = true;
            continue;
        }
        arquivoAtual.push(pedido);
    }

    return {
        pedidos: ficam,
        arquivados: [...arquivoAtual, ...vaoParaArquivo],
        arquivadosAgora: vaoParaArquivo.length,
        apagados,
        mudou,
    };
}

module.exports = {
    DIAS_NA_LISTA,
    DIAS_ARQUIVADO,
    infoCiclo,
    verificarPrazos,
};
