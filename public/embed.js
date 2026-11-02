/*
 * Quadro de vagas do Publike para o site da empresa.
 *
 *   <div class="publike-vagas" data-empresa="ID-DA-CONTA"></div>
 *   <script src="https://publike.org/embed.js" async></script>
 *
 * Opções no <div>: data-tema="claro|escuro|auto", data-limite="6", data-titulo="0" (sem o título).
 *   data-busca="0" (sem a busca e a área, que aparecem com 6 vagas ou mais).
 * O script troca o <div> por um iframe com as vagas abertas e ajusta a altura dele ao conteúdo.
 *
 * Botão "Trabalhe conosco" no canto da tela, em todas as páginas do site (abre a página de vagas):
 *
 *   <script src="https://publike.org/embed.js" data-botao="ID-DA-CONTA" async></script>
 *
 * Opções no <script>: data-texto="Vagas abertas" (o que o botão diz), data-lado="esquerda".
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
      ["tema", "limite", "titulo", "busca"].forEach(function (nome) {
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

  function botao() {
    var empresa = script && script.getAttribute("data-botao");
    if (!empresa || !/^[0-9a-f-]{36}$/i.test(empresa) || document.querySelector("a[data-publike-botao]")) return;
    var a = document.createElement("a");
    a.href = origem + "/perfil/" + empresa + "/vagas?utm_source=site-empresa&utm_medium=botao&utm_campaign=vagas";
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("data-publike-botao", "1");
    a.textContent = (script.getAttribute("data-texto") || "Trabalhe conosco").slice(0, 40);
    var lado = script.getAttribute("data-lado") === "esquerda" ? "left" : "right";
    a.style.cssText =
      "position:fixed;bottom:20px;" + lado + ":20px;z-index:2147483000;display:inline-flex;align-items:center;" +
      "min-height:48px;padding:0 22px;border-radius:999px;background:#c2410c;color:#fff;font:600 15px/1.2 -apple-system," +
      "BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.22)";
    document.body.appendChild(a);
  }

  function iniciar() {
    montar();
    botao();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
