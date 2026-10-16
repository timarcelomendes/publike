import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";
import { escaparHtml } from "@/lib/email/montar";
import { formatarLugar, rotuloModalidade, valorDoAnuncio } from "@/lib/formato";
import { vagasDaEmpresa, type VagaDoQuadro } from "@/lib/servidor/vagas-da-empresa";

// Quadro de vagas para o site da empresa: ela cola o código do painel
// ("Colocar no seu site") e as vagas abertas dela aparecem lá, sempre em dia.
// É uma página leve, sem React, feita para ficar dentro de um iframe em outro
// site (next.config.ts libera só este caminho). Cada vaga abre no Publike, numa
// aba nova, onde a pessoa se candidata. O tamanho do quadro acompanha o
// conteúdo: a página avisa a altura e o /embed.js ajusta o iframe.

const ORIGEM = "utm_source=site-empresa&utm_medium=quadro&utm_campaign=vagas";

const CORES = {
  claro:
    "--fundo:transparent;--cartao:#fffdf8;--borda:#e7dfd2;--tinta:#1f1a14;--apagado:#6b6052;--terra:#c2410c;--terra-hover:#a8380a;--selo:#f3ece1;--foco:#1f6f4a",
  escuro:
    "--fundo:transparent;--cartao:#221c16;--borda:#3a3129;--tinta:#f5efe6;--apagado:#b5a998;--terra:#d4501a;--terra-hover:#e0612b;--selo:#2e2620;--foco:#f5b301",
};

function estilo(tema: "claro" | "escuro" | "auto") {
  const base = tema === "escuro" ? CORES.escuro : CORES.claro;
  const auto = tema === "auto" ? `@media (prefers-color-scheme:dark){:root{${CORES.escuro}}}` : "";
  return `:root{${base}}${auto}
*{box-sizing:border-box}
html,body{margin:0;background:var(--fundo);color:var(--tinta)}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;padding:2px}
a{color:inherit}
a:focus-visible{outline:2px solid var(--foco);outline-offset:2px;border-radius:6px}
header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}
h1{font-size:1.15rem;line-height:1.3;margin:0}
.conta{color:var(--apagado);font-size:.875rem}
ul{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))}
li{display:flex;flex-direction:column;gap:6px;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:14px 16px}
h2{font-size:1rem;line-height:1.3;margin:0}
h2 a{text-decoration:none}h2 a:hover{text-decoration:underline}
.selo{align-self:flex-start;background:var(--selo);border-radius:999px;padding:2px 10px;font-size:.75rem;font-weight:600}
.info{margin:0;color:var(--apagado);font-size:.875rem}
.valor{margin:0;font-size:.875rem;font-weight:600}
.botao{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;background:var(--terra);color:#fff;font-weight:600;font-size:.875rem;text-decoration:none}
.botao:hover{background:var(--terra-hover)}
.vazio{background:var(--cartao);border:1px dashed var(--borda);border-radius:12px;padding:18px 16px;color:var(--apagado);margin:0}
footer{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:.8125rem;color:var(--apagado)}
footer img{height:18px;width:auto;display:block}`;
}

// Diz ao site de fora a altura do quadro (o /embed.js ajusta o iframe; sem ele, nada acontece).
const script = (quadro: string) => `(function(){var q=${JSON.stringify(quadro)},u=0;
function a(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h!==u){u=h;parent.postMessage({publike:"altura",quadro:q,altura:h},"*")}}
addEventListener("load",a);if(window.ResizeObserver)new ResizeObserver(a).observe(document.documentElement);a()})();`;

function cartao(v: VagaDoQuadro) {
  const link = `${SITE_URL}/anuncio/${v.id}?${ORIGEM}`;
  const valor = valorDoAnuncio({ tipo: "vaga", ...v });
  return `<li>
<span class="selo">${escaparHtml(rotuloModalidade("vaga", v.regime))}</span>
<h2><a href="${link}" target="_blank" rel="noopener">${escaparHtml(v.titulo)}</a></h2>
<p class="info">${escaparHtml(formatarLugar(v.bairro, v.cidade))}${v.vagas > 1 ? ` · ${v.vagas} vagas` : ""}</p>
<p class="valor">${escaparHtml(valor)}</p>
<a class="botao" href="${link}" target="_blank" rel="noopener" aria-label="Ver e se candidatar: ${escaparHtml(v.titulo)}">Ver e se candidatar</a>
</li>`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/embed/vagas/[id]">) {
  const { id } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const pedidoTema = sp.get("tema");
  const tema = pedidoTema === "escuro" || pedidoTema === "auto" ? pedidoTema : "claro";
  const limite = Math.min(30, Math.max(1, Number.parseInt(sp.get("limite") ?? "", 10) || 30));
  const quadro = /^[a-z0-9-]{1,40}$/i.test(sp.get("quadro") ?? "") ? (sp.get("quadro") as string) : "";
  const comTitulo = sp.get("titulo") !== "0";

  const dados = await vagasDaEmpresa(id);
  const cabecalhos = {
    "content-type": "text/html; charset=utf-8",
    // pode ficar dentro de qualquer site (é o que a empresa quer); o resto do Publike não
    "content-security-policy": "frame-ancestors *",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  };

  if (!dados) {
    const html = pagina(
      "Vagas",
      `<p class="vazio">Este quadro de vagas não existe mais. Confira o código no painel do Publike.</p>`,
      tema,
      quadro,
    );
    return new Response(html, { status: 404, headers: { ...cabecalhos, "cache-control": "public, max-age=60" } });
  }

  const { perfil, vagas } = dados;
  const pagVagas = `${SITE_URL}/perfil/${perfil.id}/vagas?${ORIGEM}`;
  const mostradas = vagas.slice(0, limite);
  const titulo = comTitulo
    ? `<header><h1>Vagas abertas${vagas.length ? ` (${vagas.length})` : ""}</h1><span class="conta">${escaparHtml(perfil.nome)}</span></header>`
    : "";
  const lista = mostradas.length
    ? `<ul>${mostradas.map(cartao).join("")}</ul>`
    : `<p class="vazio">Nenhuma vaga aberta agora. <a href="${pagVagas}" target="_blank" rel="noopener">Siga ${escaparHtml(perfil.nome)} no Publike</a> para saber das próximas.</p>`;
  const mais =
    vagas.length > mostradas.length
      ? ` · <a href="${pagVagas}" target="_blank" rel="noopener">ver todas as ${vagas.length}</a>`
      : "";
  const rodape = `<footer><a href="${pagVagas}" target="_blank" rel="noopener" aria-label="Publike">${logo(tema)}</a><span>Vagas no Publike, grátis para quem procura e para quem contrata${mais}</span></footer>`;

  return new Response(pagina(`Vagas de ${perfil.nome}`, titulo + lista + rodape, tema, quadro), {
    headers: cabecalhos,
  });
}

function logo(tema: "claro" | "escuro" | "auto") {
  const img = (escuro: boolean) =>
    `<img src="${SITE_URL}/logo/publike-logo${escuro ? "-escuro" : ""}.svg" alt="Publike" width="55" height="18">`;
  if (tema !== "auto") return img(tema === "escuro");
  return `<picture><source srcset="${SITE_URL}/logo/publike-logo-escuro.svg" media="(prefers-color-scheme: dark)">${img(false)}</picture>`;
}

function pagina(titulo: string, miolo: string, tema: "claro" | "escuro" | "auto", quadro: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escaparHtml(titulo)} · Publike</title><base target="_blank"><style>${estilo(tema)}</style></head>
<body>${miolo}<script>${script(quadro)}</script></body>
</html>`;
}
