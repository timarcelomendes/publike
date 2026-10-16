/*
 * Quadro de vagas do Publike para o site da empresa.
 *
 *   <div class="publike-vagas" data-empresa="ID-DA-CONTA"></div>
 *   <script src="https://publike.org/embed.js" async></script>
 *
 * Opções no <div>: data-tema="claro|escuro|auto", data-limite="6", data-titulo="0" (sem o título).
 * O script troca o <div> por um iframe com as vagas abertas e ajusta a altura dele ao conteúdo.
 */
(function () {
  var script = document.currentScript;
  var origem = script && script.src ? new URL(script.src).origin : "https://publike.org";
  var contador = 0;

  function montar() {
    var caixas = document.querySelectorAll(".publike-vagas[data-empresa]:not([data-publike-pronto])");
    for (var i = 0; i < caixas.length; i++) {
      var caixa = caixas[i];
      var empresa = caixa.getAttribute("data-empresa") || "";
      if (!/^[0-9a-f-]{36}$/i.test(empresa)) continue;
      caixa.setAttribute("data-publike-pronto", "1");
      var quadro = "pk-" + ++contador;
      var q = new URLSearchParams({ quadro: quadro });
      ["tema", "limite", "titulo"].forEach(function (nome) {
        var valor = caixa.getAttribute("data-" + nome);
        if (valor) q.set(nome, valor);
      });
      var iframe = document.createElement("iframe");
      iframe.src = origem + "/embed/vagas/" + empresa + "?" + q.toString();
      iframe.title = "Vagas abertas (Publike)";
      iframe.loading = "lazy";
      iframe.setAttribute("data-publike-quadro", quadro);
      iframe.style.cssText = "display:block;width:100%;height:320px;border:0;overflow:hidden;background:transparent";
      caixa.innerHTML = "";
      caixa.appendChild(iframe);
    }
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== origem || !e.data || e.data.publike !== "altura") return;
    var alvo = document.querySelector('iframe[data-publike-quadro="' + String(e.data.quadro).replace(/[^a-z0-9-]/gi, "") + '"]');
    var altura = Number(e.data.altura);
    if (alvo && altura > 0 && altura < 20000) alvo.style.height = altura + "px";
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
