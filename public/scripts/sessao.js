/*
 * Sessão nas páginas internas (carregado antes do script de cada página):
 * - se o servidor responder 401 (sessão expirada ou ausente), volta para a tela de entrada;
 * - botão "Sair" ([data-sair]) encerra a sessão.
 */
(() => {
    const fetchOriginal = window.fetch.bind(window);

    window.fetch = async (...argumentos) => {
        const resposta = await fetchOriginal(...argumentos);
        if (resposta.status === 401) {
            window.location.replace("/");
        }
        return resposta;
    };

    document.addEventListener("click", async (evento) => {
        const botao = evento.target.closest("[data-sair]");
        if (!botao) return;
        botao.disabled = true;
        try {
            await fetchOriginal("/api/logout", { method: "POST" });
        } finally {
            window.location.replace("/");
        }
    });
})();
