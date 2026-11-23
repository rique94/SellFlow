/*
 * Página de métricas: calcula tudo no navegador a partir de /api/pedidos
 * (data "dd/mm/aaaa", hora "HH:MM", status, valorTotal, listaPedidos).
 * Os dados são recarregados quando a aba volta a ficar visível.
 */

/* ================= Definições ================= */

const METRICAS = {
    concluidas: {
        nome: "Vendas concluídas",
        icone: "✅",
        filtro: (p) => p.status === "✅Finalizado" || p.status === "🟦Despachado",
        sobeEhBom: true,
        // Conta no dia em que a venda foi concluída (pedidos antigos sem essa data usam a de criação)
        campoData: "_dataConclusao",
    },
    totais: {
        nome: "Vendas totais",
        icone: "🧾",
        filtro: () => true,
        sobeEhBom: true,
    },
    pagar: {
        nome: "Pedidos a pagar",
        icone: "💰",
        filtro: (p) => p.status === "🔴Pagar" || p.status === "🟣Pagar local",
        sobeEhBom: false,
    },
    retirar: {
        nome: "Pedidos a retirar",
        icone: "🛍️",
        filtro: (p) => p.status === "🟡Retirar" || p.status === "🟣Pagar local",
        sobeEhBom: false,
    },
    despachar: {
        nome: "Pedidos a despachar",
        icone: "📦",
        filtro: (p) => p.status === "🔵Despachar",
        sobeEhBom: false,
    },
};

const STATUS = [
    ["✅Finalizado", "✅ Finalizado"],
    ["🟦Despachado", "🟦 Despachado"],
    ["🔵Despachar", "🔵 A despachar"],
    ["🟡Retirar", "🟡 Retirar (pago)"],
    ["🟣Pagar local", "🟣 Pagar local"],
    ["🔴Pagar", "🔴 Pagar"],
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
// Ordem de exibição no gráfico semanal: segunda a domingo
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const estado = { periodo: "30", metrica: "concluidas", medida: "valor" };
let pedidos = [];
let carregado = false;

/* ================= Formatação ================= */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dois = (n) => String(n).padStart(2, "0");
const diaMes = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;

function formatarMedida(valor, medida = estado.medida) {
    return medida === "valor" ? moeda.format(valor) : `${inteiro.format(valor)} ${valor === 1 ? "pedido" : "pedidos"}`;
}

// Eixo: números cheios até 10 mil, depois "10 mil", "1,2 mi"
function formatarEixo(valor) {
    if (valor >= 1_000_000) return `${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (valor >= 10_000) return `${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    return inteiro.format(valor);
}

function escapeHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/* ================= Cálculos ================= */

// "22/11/2026" + "14:05" -> Date (ignora pedidos sem data válida)
function dataDoPedido(pedido) {
    const [d, m, a] = String(pedido.data || "").split("/").map(Number);
    const [h, min] = String(pedido.hora || "00:00").split(":").map(Number);
    if (!d || !m || !a) return null;
    return new Date(a, m - 1, d, h || 0, min || 0);
}

function valorDoPedido(pedido) {
    const total = Number(pedido.valorTotal);
    return Number.isFinite(total) ? total : 0;
}

const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/* Período escolhido + período anterior de mesmo tamanho (para a variação) e como agrupar */
function intervalo(periodo, agora = new Date()) {
    const hoje = inicioDoDia(agora);
    const amanha = somarDias(hoje, 1);
    if (periodo === "hoje") {
        const decorrido = agora - hoje;
        return { inicio: hoje, fim: amanha, antInicio: somarDias(hoje, -1), antFim: new Date(somarDias(hoje, -1).getTime() + decorrido), grupo: "hora", nomeAnterior: "ontem até esta hora" };
    }
    if (periodo === "mes") {
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const antInicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const diasDecorridos = Math.round((amanha - inicio) / 86400000);
        return { inicio, fim: amanha, antInicio, antFim: somarDias(antInicio, diasDecorridos), grupo: "dia", nomeAnterior: "mesmo período do mês passado" };
    }
    const dias = Number(periodo);
    const inicio = somarDias(hoje, -(dias - 1));
    return { inicio, fim: amanha, antInicio: somarDias(inicio, -dias), antFim: inicio, grupo: dias > 31 ? "semana" : "dia", nomeAnterior: `${dias} dias anteriores` };
}

// campo: "_data" (criação do pedido) ou "_dataConclusao" (quando virou venda concluída)
function pedidosEntre(inicio, fim, campo = "_data") {
    return pedidos.filter((p) => p[campo] && p[campo] >= inicio && p[campo] < fim);
}

// Pedidos de uma métrica no período, pela data que faz sentido para ela
function daMetricaEntre(def, inicio, fim) {
    return pedidosEntre(inicio, fim, def.campoData || "_data").filter(def.filtro);
}

function somar(lista, medida) {
    return medida === "valor" ? lista.reduce((s, p) => s + valorDoPedido(p), 0) : lista.length;
}

/* Divide o período em barras (horas, dias ou semanas) */
function agrupar(lista, faixa, medida, campo = "_data") {
    const grupos = [];
    if (faixa.grupo === "hora") {
        for (let h = 0; h < 24; h++) grupos.push({ rotulo: `${h}h`, dica: `${h}h às ${h + 1}h`, inicio: h, valor: 0, reais: 0, pedidos: 0 });
        lista.forEach((p) => somarNoGrupo(grupos[p[campo].getHours()], p, medida));
        return grupos;
    }
    const passo = faixa.grupo === "semana" ? 7 : 1;
    for (let d = faixa.inicio; d < faixa.fim; d = somarDias(d, passo)) {
        const fimGrupo = somarDias(d, passo);
        const ultimo = somarDias(fimGrupo, -1) < faixa.fim ? somarDias(fimGrupo, -1) : somarDias(faixa.fim, -1);
        grupos.push({
            rotulo: diaMes(d),
            dica: passo === 7 ? `Semana de ${diaMes(d)} a ${diaMes(ultimo)}` : `${DIAS_SEMANA_LONGO[d.getDay()]}, ${diaMes(d)}`,
            inicio: d,
            fim: fimGrupo,
            valor: 0,
            reais: 0,
            pedidos: 0,
        });
    }
    lista.forEach((p) => {
        const g = grupos.find((x) => p[campo] >= x.inicio && p[campo] < x.fim);
        if (g) somarNoGrupo(g, p, medida);
    });
    return grupos;
}

function somarNoGrupo(grupo, pedido, medida) {
    const reais = valorDoPedido(pedido);
    grupo.reais += reais;
    grupo.pedidos += 1;
    grupo.valor += medida === "valor" ? reais : 1;
}

function variacao(atual, anterior) {
    if (!anterior) return null;
    return (atual - anterior) / anterior;
}

function textoVariacao(v, sobeEhBom) {
    if (v === null) return "";
    const pct = Math.abs(v * 100);
    const arredondado = pct < 10 ? pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : Math.round(pct);
    if (Math.abs(v) < 0.005) return `<span>= sem mudança</span>`;
    const sobe = v > 0;
    const bom = sobe === sobeEhBom;
    return `<span class="${bom ? "sobe" : "desce"}">${sobe ? "▲" : "▼"} ${arredondado}%</span>`;
}

/* ================= Gráficos (SVG) ================= */

const SVG = "http://www.w3.org/2000/svg";
const tooltip = document.getElementById("tooltip");

function el(nome, atributos = {}) {
    const elemento = document.createElementNS(SVG, nome);
    Object.entries(atributos).forEach(([k, v]) => elemento.setAttribute(k, v));
    return elemento;
}

// Escala "redonda" para o eixo (0, 250, 500, 750...)
function escala(maximo, divisoes = 4, inteiros = false) {
    if (maximo <= 0) return [0, 1];
    const bruto = maximo / divisoes;
    const potencia = 10 ** Math.floor(Math.log10(bruto));
    const passoBase = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
    const passo = inteiros ? Math.max(1, Math.ceil(passoBase)) : passoBase;
    const marcas = [];
    for (let v = 0; v < maximo + passo * 0.001; v += passo) marcas.push(Number(v.toFixed(6)));
    if (marcas[marcas.length - 1] < maximo) marcas.push(marcas[marcas.length - 1] + passo);
    return marcas;
}

// Coluna com ponta arredondada (4px) e base reta
function caminhoColuna(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function mostrarTooltip(alvoRect, titulo, linha, extra) {
    tooltip.innerHTML = `<div class="m-tooltip-titulo">${escapeHtml(titulo)}</div><div class="m-tooltip-linha">${escapeHtml(linha)}</div>${extra ? `<div class="m-tooltip-extra">${escapeHtml(extra)}</div>` : ""}`;
    tooltip.hidden = false;
    const caixa = tooltip.getBoundingClientRect();
    let x = alvoRect.left + alvoRect.width / 2 - caixa.width / 2;
    let y = alvoRect.top - caixa.height - 10;
    x = Math.max(8, Math.min(x, window.innerWidth - caixa.width - 8));
    if (y < 8) y = alvoRect.bottom + 10;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function esconderTooltip() {
    tooltip.hidden = true;
}

/*
 * Gráfico de colunas de uma série. pontos = [{ rotulo, dica, valor, pedidos }]
 * Passe o mouse (ou use as setas com o gráfico em foco) para ver cada valor.
 */
function desenharColunas(container, pontos, { medida, descricao }) {
    container.innerHTML = "";
    container.classList.remove("tem-foco");
    if (!pontos.some((p) => p.valor > 0)) {
        container.innerHTML = '<div class="m-vazio">Nenhum pedido neste período</div>';
        return;
    }

    const largura = container.clientWidth;
    const altura = container.clientHeight;
    const marcas = escala(Math.max(...pontos.map((p) => p.valor)), 4, medida !== "valor");
    const topo = marcas[marcas.length - 1];
    const maiorRotulo = Math.max(...marcas.map((m) => formatarEixo(m).length));
    const m = { cima: 22, direita: 6, baixo: 24, esquerda: maiorRotulo * 6.6 + 12 };
    const larguraUtil = largura - m.esquerda - m.direita;
    const alturaUtil = altura - m.cima - m.baixo;
    // Área ainda sem tamanho (ex.: no meio de um redimensionamento): desenha no próximo ciclo
    if (larguraUtil < 40 || alturaUtil < 40) {
        return;
    }
    const faixa = larguraUtil / pontos.length;
    const larguraBarra = Math.max(2, Math.min(24, faixa * 0.62));
    const y = (v) => m.cima + alturaUtil - (v / topo) * alturaUtil;

    const svg = el("svg", { width: largura, height: altura, role: "img", tabindex: "0", "aria-label": `${descricao}. Use as setas para ver cada valor.` });

    marcas.forEach((marca) => {
        const yy = Math.round(y(marca)) + 0.5;
        svg.append(el("line", { x1: m.esquerda, x2: largura - m.direita, y1: yy, y2: yy, class: marca === 0 ? "base" : "grade" }));
        const texto = el("text", { x: m.esquerda - 8, y: yy + 4, "text-anchor": "end" });
        texto.textContent = formatarEixo(marca);
        svg.append(texto);
    });

    // Rótulos do eixo X sem encavalar (no mínimo ~46px entre eles)
    const pularRotulos = Math.max(1, Math.ceil(46 / faixa));
    const indiceMaior = pontos.reduce((melhor, p, i) => (p.valor > pontos[melhor].valor ? i : melhor), 0);
    const barras = [];

    pontos.forEach((ponto, i) => {
        const centro = m.esquerda + faixa * i + faixa / 2;
        const h = (ponto.valor / topo) * alturaUtil;
        const barra = el("path", { d: ponto.valor > 0 ? caminhoColuna(centro - larguraBarra / 2, y(ponto.valor), larguraBarra, h) : "", class: "marca" });
        barras.push(barra);
        svg.append(barra);

        if ((pontos.length - 1 - i) % pularRotulos === 0) {
            const texto = el("text", { x: centro, y: altura - 6, "text-anchor": "middle" });
            texto.textContent = ponto.rotulo;
            svg.append(texto);
        }
    });

    // Só o maior valor ganha rótulo direto; os outros ficam no eixo e no tooltip
    const maior = pontos[indiceMaior];
    const centroMaior = m.esquerda + faixa * indiceMaior + faixa / 2;
    const rotulo = el("text", { x: Math.min(Math.max(centroMaior, m.esquerda + 30), largura - 30), y: y(maior.valor) - 7, "text-anchor": "middle", class: "rotulo-valor" });
    rotulo.textContent = medida === "valor" ? moeda.format(maior.valor) : inteiro.format(maior.valor);
    svg.append(rotulo);

    // Áreas de hover maiores que as barras (a faixa inteira)
    let focoAtual = -1;
    const focar = (i) => {
        focoAtual = i;
        container.classList.add("tem-foco");
        barras.forEach((b, j) => b.classList.toggle("foco", j === i));
        const p = pontos[i];
        const alvo = alvos[i].getBoundingClientRect();
        const topoBarra = { left: alvo.left, width: alvo.width, top: alvo.top + (alturaUtil - (p.valor / topo) * alturaUtil), bottom: alvo.bottom };
        const extra = medida === "valor" ? `${p.pedidos} ${p.pedidos === 1 ? "pedido" : "pedidos"}` : moeda.format(p.reais);
        mostrarTooltip(topoBarra, p.dica, formatarMedida(p.valor, medida), extra);
    };
    const desfocar = () => {
        focoAtual = -1;
        container.classList.remove("tem-foco");
        barras.forEach((b) => b.classList.remove("foco"));
        esconderTooltip();
    };
    const alvos = pontos.map((_, i) => {
        const alvo = el("rect", { x: m.esquerda + faixa * i, y: m.cima, width: faixa, height: alturaUtil, class: "alvo" });
        alvo.addEventListener("mouseenter", () => focar(i));
        alvo.addEventListener("mouseleave", desfocar);
        svg.append(alvo);
        return alvo;
    });
    svg.addEventListener("keydown", (evento) => {
        if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
        evento.preventDefault();
        const passo = evento.key === "ArrowRight" ? 1 : -1;
        focar(focoAtual < 0 ? (passo > 0 ? 0 : pontos.length - 1) : (focoAtual + passo + pontos.length) % pontos.length);
    });
    svg.addEventListener("blur", desfocar);

    container.append(svg);
}

function desenharSparkline(container, valores) {
    container.innerHTML = "";
    const largura = container.clientWidth;
    const altura = container.clientHeight;
    if (!largura || !altura || valores.length < 2 || !valores.some((v) => v > 0)) return;
    const max = Math.max(...valores);
    const folga = 6;
    const x = (i) => folga + (i / (valores.length - 1)) * (largura - folga * 2);
    const y = (v) => folga + (1 - v / max) * (altura - folga * 2);
    const linha = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const svg = el("svg", { width: largura, height: altura });
    svg.append(el("path", { d: `${linha}L${x(valores.length - 1)},${altura}L${x(0)},${altura}Z`, fill: "var(--m-serie-lavagem)" }));
    svg.append(el("path", { d: linha, fill: "none", stroke: "var(--m-serie)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const ultimo = valores.length - 1;
    svg.append(el("circle", { cx: x(ultimo), cy: y(valores[ultimo]), r: 4, fill: "var(--m-serie)", stroke: "#fff", "stroke-width": 2 }));
    container.append(svg);
}

function desenharBarrasHorizontais(lista, itens, vazio) {
    if (!itens.length || !itens.some((i) => i.valor > 0)) {
        lista.innerHTML = `<li class="m-vazio">${vazio}</li>`;
        return;
    }
    const max = Math.max(...itens.map((i) => i.valor));
    lista.innerHTML = itens
        .map((item) => `
            <li class="m-barra" title="${escapeHtml(`${item.nome}: ${item.textoValor}${item.extra ? ` · ${item.extra}` : ""}`)}">
                <span class="m-barra-nome">${escapeHtml(item.nome)}</span>
                <span class="m-barra-trilho"><span class="m-barra-preenchida" data-largura="${(item.valor / max) * 100}"></span></span>
                <span class="m-barra-valor">${escapeHtml(item.textoValor)}${item.extra ? `<small>${escapeHtml(item.extra)}</small>` : ""}</span>
            </li>`)
        .join("");
    // Largura aplicada pelo JS (a CSP não permite style="..." dentro do HTML)
    lista.querySelectorAll("[data-largura]").forEach((barra) => {
        barra.style.width = `${barra.dataset.largura}%`;
    });
}

/* ================= Tela ================= */

function nomeGrupo(faixa) {
    return { hora: "hora", dia: "dia", semana: "semana" }[faixa.grupo];
}

function atualizar() {
    const faixa = intervalo(estado.periodo);
    const doPeriodo = pedidosEntre(faixa.inicio, faixa.fim);
    const metrica = METRICAS[estado.metrica];

    /* Número principal: faturamento das vendas concluídas */
    const concluidas = daMetricaEntre(METRICAS.concluidas, faixa.inicio, faixa.fim);
    const concluidasAnt = daMetricaEntre(METRICAS.concluidas, faixa.antInicio, faixa.antFim);
    const faturamento = somar(concluidas, "valor");
    document.getElementById("hero-valor").textContent = moeda.format(faturamento);
    const v = variacao(faturamento, somar(concluidasAnt, "valor"));
    document.getElementById("hero-variacao").innerHTML = v === null
        ? "Sem dados do período anterior para comparar"
        : `${textoVariacao(v, true)} em relação a ${faixa.nomeAnterior}`;
    desenharSparkline(document.getElementById("hero-sparkline"), agrupar(concluidas, faixa, "valor", "_dataConclusao").map((g) => g.valor));

    /* Indicadores (cada um também escolhe o que os gráficos mostram) */
    const indicadores = Object.entries(METRICAS).map(([chave, def]) => {
        const atual = daMetricaEntre(def, faixa.inicio, faixa.fim);
        const anterior = daMetricaEntre(def, faixa.antInicio, faixa.antFim);
        const varQtd = variacao(atual.length, anterior.length);
        return `
            <button type="button" class="m-indicador" role="radio" aria-checked="${chave === estado.metrica}" data-metrica="${chave}">
                <span class="m-indicador-rotulo"><span class="m-indicador-icone" aria-hidden="true">${def.icone}</span>${def.nome}</span>
                <span class="m-indicador-valor">${inteiro.format(atual.length)}</span>
                <span class="m-indicador-extra">${moeda.format(somar(atual, "valor"))}${varQtd !== null ? ` · ${textoVariacao(varQtd, def.sobeEhBom)}` : ""}</span>
            </button>`;
    });
    const ticket = concluidas.length ? faturamento / concluidas.length : 0;
    const ticketAnt = concluidasAnt.length ? somar(concluidasAnt, "valor") / concluidasAnt.length : 0;
    const varTicket = variacao(ticket, ticketAnt);
    indicadores.push(`
        <div class="m-indicador m-indicador-fixo">
            <span class="m-indicador-rotulo"><span class="m-indicador-icone" aria-hidden="true">🎯</span>Ticket médio</span>
            <span class="m-indicador-valor">${moeda.format(ticket)}</span>
            <span class="m-indicador-extra">por venda concluída${varTicket !== null ? ` · ${textoVariacao(varTicket, true)}` : ""}</span>
        </div>`);
    document.getElementById("indicadores").innerHTML = indicadores.join("");

    /* Gráfico principal */
    const campo = metrica.campoData || "_data";
    const daMetrica = daMetricaEntre(metrica, faixa.inicio, faixa.fim);
    const grupos = agrupar(daMetrica, faixa, estado.medida, campo);
    const unidade = estado.medida === "valor" ? "Valor (R$)" : "Quantidade de pedidos";
    document.getElementById("titulo-principal").textContent = metrica.nome;
    document.getElementById("subtitulo-principal").textContent = `${unidade} por ${nomeGrupo(faixa)}`;
    desenharColunas(document.getElementById("grafico-principal"), grupos, {
        medida: estado.medida,
        descricao: `${metrica.nome}, ${unidade.toLowerCase()} por ${nomeGrupo(faixa)}`,
    });
    desenharTabela(grupos, faixa);

    /* Dias da semana e horários */
    const sufixo = `${estado.medida === "valor" ? "valor (R$)" : "pedidos"} · ${metrica.nome.toLowerCase()}`;
    const semana = ORDEM_SEMANA.map((dia) => ({ rotulo: DIAS_SEMANA[dia], dica: DIAS_SEMANA_LONGO[dia], valor: 0, reais: 0, pedidos: 0, dia }));
    daMetrica.forEach((p) => somarNoGrupo(semana.find((s) => s.dia === p[campo].getDay()), p, estado.medida));
    document.getElementById("subtitulo-semana").textContent = `Soma por dia da semana — ${sufixo}`;
    desenharColunas(document.getElementById("grafico-semana"), semana, { medida: estado.medida, descricao: "Vendas por dia da semana" });

    const horas = agrupar(daMetrica, { grupo: "hora" }, estado.medida, campo);
    const comVenda = horas.map((h, i) => (h.pedidos ? i : -1)).filter((i) => i >= 0);
    const primeira = Math.min(8, ...comVenda);
    const ultima = Math.max(20, ...comVenda);
    document.getElementById("subtitulo-horario").textContent = `Soma por hora do dia — ${sufixo}`;
    desenharColunas(document.getElementById("grafico-horario"), horas.slice(primeira, ultima + 1), { medida: estado.medida, descricao: "Vendas por hora do dia" });

    /* Situação dos pedidos */
    desenharBarrasHorizontais(
        document.getElementById("lista-status"),
        STATUS.map(([valor, nome]) => {
            const lista = doPeriodo.filter((p) => p.status === valor);
            return { nome, valor: lista.length, textoValor: inteiro.format(lista.length), extra: moeda.format(somar(lista, "valor")) };
        }).sort((a, b) => b.valor - a.valor),
        "Nenhum pedido neste período",
    );

    /* Peças mais vendidas */
    const pecas = new Map();
    daMetrica.forEach((p) => (p.listaPedidos || []).forEach((item) => {
        const nome = String(item.desc_peca || "").trim() || "Sem descrição";
        const atual = pecas.get(nome) || { qtd: 0, valor: 0 };
        const qtd = Number(item.qtd_peca) || 0;
        atual.qtd += qtd;
        atual.valor += qtd * (Number(item.valor_peca) || 0);
        pecas.set(nome, atual);
    }));
    document.getElementById("subtitulo-produtos").textContent = `Por quantidade de peças — ${metrica.nome.toLowerCase()}`;
    desenharBarrasHorizontais(
        document.getElementById("lista-produtos"),
        [...pecas.entries()]
            .sort((a, b) => b[1].qtd - a[1].qtd)
            .slice(0, 6)
            .map(([nome, d]) => ({ nome, valor: d.qtd, textoValor: `${inteiro.format(d.qtd)} ${d.qtd === 1 ? "peça" : "peças"}`, extra: moeda.format(d.valor) })),
        "Nenhuma peça neste período",
    );
}

function desenharTabela(grupos, faixa) {
    const coluna = faixa.grupo === "hora" ? "Hora" : faixa.grupo === "semana" ? "Semana" : "Dia";
    document.getElementById("tabela-principal").innerHTML = `
        <table>
            <thead><tr><th>${coluna}</th><th class="num">Valor</th><th class="num">Pedidos</th></tr></thead>
            <tbody>
                ${grupos.map((g) => `<tr><td>${escapeHtml(g.dica)}</td><td class="num">${moeda.format(g.reais)}</td><td class="num">${inteiro.format(g.pedidos)}</td></tr>`).join("")}
            </tbody>
        </table>`;
}

/* ================= Controles ================= */

function marcarAtivo(grupo, botao) {
    grupo.querySelectorAll("button").forEach((b) => {
        const ativo = b === botao;
        b.classList.toggle("ativo", ativo);
        b.setAttribute("aria-pressed", String(ativo));
    });
}

document.querySelector(".m-periodo").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-periodo]");
    if (!botao) return;
    estado.periodo = botao.dataset.periodo;
    marcarAtivo(evento.currentTarget, botao);
    atualizar();
});

document.querySelector(".m-alternar").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-medida]");
    if (!botao) return;
    estado.medida = botao.dataset.medida;
    marcarAtivo(evento.currentTarget, botao);
    atualizar();
});

document.getElementById("indicadores").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-metrica]");
    if (!botao) return;
    estado.metrica = botao.dataset.metrica;
    atualizar();
    document.querySelector(`[data-metrica="${estado.metrica}"]`)?.focus();
});

document.getElementById("botao-tabela").addEventListener("click", (evento) => {
    const tabela = document.getElementById("tabela-principal");
    tabela.hidden = !tabela.hidden;
    evento.currentTarget.setAttribute("aria-expanded", String(!tabela.hidden));
    evento.currentTarget.textContent = tabela.hidden ? "Ver tabela" : "Esconder tabela";
});

// Redesenha os gráficos quando a largura muda
let quadroPendente = 0;
new ResizeObserver(() => {
    cancelAnimationFrame(quadroPendente);
    quadroPendente = requestAnimationFrame(() => carregado && atualizar());
}).observe(document.querySelector("main"));
window.addEventListener("scroll", esconderTooltip, { passive: true });

/* ================= Início ================= */

function mostrarAviso(texto) {
    const aviso = document.getElementById("aviso");
    aviso.textContent = texto;
    aviso.hidden = !texto;
}

async function carregarDados() {
    try {
        // Os arquivados (concluídos há mais de 30 dias) também contam nas métricas
        const [respostaLoja, respostaPedidos, respostaArquivados] = await Promise.all([
            fetch("/api/loja"),
            fetch("/api/pedidos"),
            fetch("/api/pedidos/arquivados"),
        ]);
        // Sem loja cadastrada: volta para a tela de entrada
        if (respostaLoja.status === 503 || respostaPedidos.status === 503) {
            window.location.replace("/");
            return;
        }
        if (respostaLoja.ok) {
            document.getElementById("nome_loja").textContent = (await respostaLoja.json()).usrName || "";
        }
        const corpo = await respostaPedidos.json().catch(() => null);
        if (!respostaPedidos.ok || !Array.isArray(corpo)) {
            throw new Error(corpo?.error || "Não foi possível carregar os pedidos.");
        }
        const corpoArquivados = await respostaArquivados.json().catch(() => null);
        const arquivados = respostaArquivados.ok && Array.isArray(corpoArquivados) ? corpoArquivados : [];
        pedidos = [...corpo, ...arquivados].map((p) => {
            const criacao = dataDoPedido(p);
            const conclusao = p.dataConclusao ? dataDoPedido({ data: p.dataConclusao, hora: p.horaConclusao }) : null;
            return { ...p, _data: criacao, _dataConclusao: conclusao || criacao };
        });
        mostrarAviso("");
    } catch (error) {
        mostrarAviso(
            error instanceof TypeError
                ? "Não foi possível conectar ao sistema. Verifique se o SellFlow está aberto."
                : error.message,
        );
    }
    carregado = true;
    atualizar();
}

// Pedido novo criado em outra aba: atualiza ao voltar para esta
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && carregado) carregarDados();
});

carregarDados();
