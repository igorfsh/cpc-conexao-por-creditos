(function () {
  "use strict";

  var CHAVE = "cpc-acessibilidade";
  var NIVEIS_FONTE = ["a11y-font-1", "a11y-font-2", "a11y-font-3", "a11y-font-4", "a11y-font-5"];

  function estadoPadrao() {
    return { contraste: false, escuro: false, fonte: 0 }; // fonte: índice em NIVEIS_FONTE
  }

  function carregarEstado() {
    try {
      var salvo = localStorage.getItem(CHAVE);
      if (!salvo) return estadoPadrao();
      var obj = JSON.parse(salvo);
      return {
        contraste: !!obj.contraste,
        escuro: !!obj.escuro,
        fonte: typeof obj.fonte === "number" ? Math.min(Math.max(obj.fonte, 0), NIVEIS_FONTE.length - 1) : 0,
      };
    } catch (e) {
      return estadoPadrao();
    }
  }

  function salvarEstado(estado) {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* ignora */ }
  }

  function aplicarEstado(estado) {
    var html = document.documentElement;

    html.classList.toggle("a11y-contraste", estado.contraste);
    html.classList.toggle("a11y-dark", estado.escuro);

    NIVEIS_FONTE.forEach(function (classe) { html.classList.remove(classe); });
    html.classList.add(NIVEIS_FONTE[estado.fonte]);

    var btnContraste = document.getElementById("a11y-toggle-contraste");
    var btnTema = document.getElementById("a11y-toggle-tema");
    if (btnContraste) btnContraste.setAttribute("aria-pressed", String(estado.contraste));
    if (btnTema) {
      btnTema.setAttribute("aria-pressed", String(estado.escuro));
      btnTema.textContent = estado.escuro ? "☀️ Modo claro" : "🌙 Modo escuro";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var estado = carregarEstado();
    aplicarEstado(estado);

    var botao = document.getElementById("a11y-btn");
    var painel = document.getElementById("a11y-panel");
    var fechar = document.getElementById("a11y-close");
    var toggleContraste = document.getElementById("a11y-toggle-contraste");
    var toggleTema = document.getElementById("a11y-toggle-tema");
    var fonteMais = document.getElementById("a11y-font-mais");
    var fonteMenos = document.getElementById("a11y-font-menos");
    var reset = document.getElementById("a11y-reset");

    if (!botao || !painel) return;

    function abrirPainel() {
      painel.classList.add("aberto");
      botao.setAttribute("aria-expanded", "true");
    }
    function fecharPainel() {
      painel.classList.remove("aberto");
      botao.setAttribute("aria-expanded", "false");
    }

    botao.addEventListener("click", function () {
      painel.classList.contains("aberto") ? fecharPainel() : abrirPainel();
    });
    fechar.addEventListener("click", fecharPainel);

    document.addEventListener("click", function (evento) {
      if (!painel.classList.contains("aberto")) return;
      var dentroDoPainel = painel.contains(evento.target);
      var noBotao = botao.contains(evento.target);
      if (!dentroDoPainel && !noBotao) fecharPainel();
    });

    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape") fecharPainel();
    });

    toggleContraste.addEventListener("click", function () {
      estado.contraste = !estado.contraste;
      aplicarEstado(estado);
      salvarEstado(estado);
    });

    var timerTransicao;
    function trocarComTransicao() {
      var html = document.documentElement;
      html.classList.add("a11y-transicao");
      clearTimeout(timerTransicao);
      timerTransicao = setTimeout(function () { html.classList.remove("a11y-transicao"); }, 450);
    }

    toggleTema.addEventListener("click", function () {
      estado.escuro = !estado.escuro;
      trocarComTransicao();
      aplicarEstado(estado);
      salvarEstado(estado);
    });

    fonteMais.addEventListener("click", function () {
      estado.fonte = Math.min(estado.fonte + 1, NIVEIS_FONTE.length - 1);
      aplicarEstado(estado);
      salvarEstado(estado);
    });

    fonteMenos.addEventListener("click", function () {
      estado.fonte = Math.max(estado.fonte - 1, 0);
      aplicarEstado(estado);
      salvarEstado(estado);
    });

    reset.addEventListener("click", function () {
      if (estado.escuro) trocarComTransicao();
      estado = estadoPadrao();
      aplicarEstado(estado);
      salvarEstado(estado);
    });
  });
})();