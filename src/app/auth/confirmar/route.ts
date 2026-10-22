import { type NextRequest } from "next/server";
import { escaparHtml } from "@/lib/email/montar";
import { caminhoSeguro } from "@/lib/formato";
import { COOKIE_PEDIU_LINK, linkDeEntradaValido } from "@/lib/link-entrada";
import { origemValida } from "@/lib/origem";
import { SCRIPT_TEMA } from "@/lib/tema";

// Página do link de entrar por e-mail (vem de /auth/callback). É uma página
// leve, sem React: no navegador que pediu o link, ela já envia o formulário assim
// que abre, e sem JavaScript o botão continua funcionando. Robôs que só abrem o
// link (antivírus do e-mail, prévia de mensagem) não enviam o formulário e
// não gastam a entrada: ela só acontece no POST em /auth/callback.
// Em outro navegador (o link foi aberto noutro aparelho, ou alguém mandou o link
// da conta dele), a página pergunta antes: ninguém entra na conta de outra
// pessoa sem perceber e preenche ali o WhatsApp ou o currículo.

// o tema que a pessoa escolheu no site (claro por padrão; lib/tema.ts)
const ESCURO =
  "--fundo:#17130f;--tinta:#f5efe6;--apagado:#b5a998;--terra-hover:#d4501a;--foco:#f5b301;color-scheme:dark";

const ESTILO = `
:root{--fundo:#fbf7ef;--tinta:#1f1a14;--apagado:#6b6052;--terra:#c2410c;--terra-hover:#a8380a;--foco:#1f6f4a;color-scheme:light}
:root[data-tema=escuro]{${ESCURO}}@media (prefers-color-scheme:dark){:root[data-tema=auto]{${ESCURO}}}
.logo-escuro,:root[data-tema=escuro] .logo-claro{display:none}:root[data-tema=escuro] .logo-escuro{display:block}
@media (prefers-color-scheme:dark){:root[data-tema=auto] .logo-claro{display:none}:root[data-tema=auto] .logo-escuro{display:block}}
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

// Dois toques não gastam o link duas vezes; o "voltar" libera o botão. Com `sozinho`, envia ao abrir.
const script = (sozinho: boolean) => `(function(){var f=document.forms[0];if(!f)return;var b=f.querySelector("button"),t=b.textContent,e=false;
f.addEventListener("submit",function(v){if(e){v.preventDefault();return}e=true;b.disabled=true;b.textContent="Entrando…"});
addEventListener("pageshow",function(v){if(v.persisted){e=false;b.disabled=false;b.textContent=t}});
${sozinho ? `if(f.requestSubmit)f.requestSubmit();else{e=true;f.submit()}` : ""}})();`;

function pagina(titulo: string, miolo: string, script = "") {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escaparHtml(titulo)} · Publike</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>${ESTILO}</style>
<script>${SCRIPT_TEMA}</script></head>
<body><main>
<img class="logo-claro" src="/logo/publike-logo.svg" alt="Publike" width="122" height="40"><img class="logo-escuro" src="/logo/publike-logo-escuro.svg" alt="Publike" width="122" height="40">
${miolo}
</main>${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get("token_hash");
  const tipo = sp.get("type") ?? "email";
  const proximo = caminhoSeguro(sp.get("next"), "/");
  const origem = sp.get("origem");
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

  const formulario = (botao: string) => `<form method="post" action="/auth/callback">
<input type="hidden" name="token_hash" value="${escaparHtml(tokenHash)}">
<input type="hidden" name="type" value="${escaparHtml(tipo)}">
<input type="hidden" name="next" value="${escaparHtml(proximo)}">
${origemValida(origem) ? `<input type="hidden" name="origem" value="${escaparHtml(origem)}">\n` : ""}<button type="submit">${botao}</button>
</form>`;

  // troca do e-mail de login: confirma com um toque (nunca sozinha)
  if (tipo === "email_change") {
    const html = pagina(
      "Trocar e-mail",
      `<h1>Confirme a troca de e-mail</h1>
<p>Toque no botão para confirmar o e-mail novo da sua conta no Publike.</p>
${formulario("Confirmar a troca")}
<p class="nota">Não pediu a troca? É só fechar esta página: nada muda sem este toque.</p>`,
      script(false),
    );
    return new Response(html, { headers: cabecalhos });
  }

  // este navegador pediu o link há pouco: entra sozinho
  if (request.cookies.get(COOKIE_PEDIU_LINK)?.value === "1") {
    const html = pagina(
      "Entrar",
      `<h1>Entrando no Publike</h1>
<p>Se não entrar sozinho em alguns segundos, toque no botão.</p>
${formulario("Entrar no Publike")}
<p class="nota">Não pediu para entrar? É só fechar esta página: ninguém entra na sua conta sem este link.</p>`,
      script(true),
    );
    return new Response(html, { headers: cabecalhos });
  }

  // link mandado pela equipe (conta criada no admin): a pessoa não "pediu", recebeu
  if (tipo === "magiclink") {
    const html = pagina(
      "Entrar",
      `<h1>Sua conta no Publike</h1>
<p>Este link abre a conta que o Publike criou para o seu e-mail. Toque no botão para entrar.</p>
${formulario("Entrar no Publike")}
<p class="nota">Não esperava este e-mail? É só fechar esta página: ninguém entra na conta sem este link.</p>`,
      script(false),
    );
    return new Response(html, { headers: cabecalhos });
  }

  // outro navegador: pergunta antes de entrar
  const html = pagina(
    "Entrar",
    `<h1>Foi você que pediu para entrar?</h1>
<p>Este link abre a conta de quem pediu para entrar. Se foi você, toque no botão. Se alguém mandou este link para você, feche esta página.</p>
${formulario("Sim, entrar no Publike")}
<p class="nota">Ninguém entra na sua conta sem um link que chegou no seu e-mail.</p>`,
    script(false),
  );
  return new Response(html, { headers: cabecalhos });
}
