import { type NextRequest } from "next/server";
import { escaparHtml } from "@/lib/email/montar";
import { caminhoSeguro } from "@/lib/formato";
import { linkDeEntradaValido } from "@/lib/link-entrada";

// Página do link de entrar por e-mail (vem de /auth/callback). É uma página
// leve, sem React: no celular mais simples ela já envia o formulário assim que
// abre, e sem JavaScript o botão continua funcionando. Robôs que só abrem o
// link (antivírus do e-mail, prévia de mensagem) não enviam o formulário e
// não gastam a entrada: ela só acontece no POST em /auth/callback.

const ESTILO = `
:root{--fundo:#fbf7ef;--tinta:#1f1a14;--apagado:#6b6052;--terra:#c2410c;--terra-hover:#a8380a;--foco:#1f6f4a;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--fundo:#17130f;--tinta:#f5efe6;--apagado:#b5a998;--terra-hover:#d4501a;--foco:#f5b301}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:var(--fundo);color:var(--tinta);
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px 16px;text-align:center}
main{max-width:26rem;display:flex;flex-direction:column;align-items:center}
img{display:block;height:40px;width:auto}
h1{font-size:1.6rem;line-height:1.25;margin:28px 0 8px}
p{margin:0;font-size:1rem;line-height:1.55;color:var(--apagado)}
form{margin:24px 0 0}
button{min-height:48px;padding:0 24px;border:0;border-radius:10px;background:var(--terra);color:#fff;font:600 1rem/1 inherit;cursor:pointer}
button:hover{background:var(--terra-hover)}button:disabled{opacity:.7;cursor:default}
button:focus-visible,a:focus-visible{outline:2px solid var(--foco);outline-offset:3px}
.nota{margin-top:32px;font-size:.875rem}
a{color:inherit}`;

// Envia sozinho uma vez; dois toques não gastam o link duas vezes; o "voltar" libera o botão.
const SCRIPT = `(function(){var f=document.forms[0];if(!f)return;var b=f.querySelector("button"),t=b.textContent,e=false;
f.addEventListener("submit",function(v){if(e){v.preventDefault();return}e=true;b.disabled=true;b.textContent="Entrando…"});
addEventListener("pageshow",function(v){if(v.persisted){e=false;b.disabled=false;b.textContent=t}});
if(f.requestSubmit)f.requestSubmit();else{e=true;f.submit()}})();`;

function pagina(titulo: string, miolo: string, script = "") {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escaparHtml(titulo)} · Publike</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>${ESTILO}</style></head>
<body><main>
<picture><source srcset="/logo/publike-logo-escuro.svg" media="(prefers-color-scheme: dark)"><img src="/logo/publike-logo.svg" alt="Publike" width="122" height="40"></picture>
${miolo}
</main>${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get("token_hash");
  const tipo = sp.get("type") ?? "email";
  const proximo = caminhoSeguro(sp.get("next"), "/");
  const cabecalhos = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };

  if (!linkDeEntradaValido(tokenHash, tipo)) {
    const html = pagina(
      "Link incompleto",
      `<h1>Esse link não está completo</h1>
<p>Pode ser que um pedaço dele tenha ficado para trás. Peça um link novo para entrar.</p>
<form method="get" action="/entrar"><input type="hidden" name="next" value="${escaparHtml(proximo)}"><button type="submit">Pedir outro link</button></form>`,
    );
    return new Response(html, { status: 400, headers: cabecalhos });
  }

  const html = pagina(
    "Entrar",
    `<h1>Entrando no Publike</h1>
<p>Se não entrar sozinho em alguns segundos, toque no botão.</p>
<form method="post" action="/auth/callback">
<input type="hidden" name="token_hash" value="${escaparHtml(tokenHash)}">
<input type="hidden" name="type" value="${escaparHtml(tipo)}">
<input type="hidden" name="next" value="${escaparHtml(proximo)}">
<button type="submit">Entrar no Publike</button>
</form>
<p class="nota">Não pediu para entrar? É só fechar esta página: ninguém entra na sua conta sem este link.</p>`,
    SCRIPT,
  );
  return new Response(html, { headers: cabecalhos });
}
