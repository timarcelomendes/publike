import { SITE_URL } from "@/lib/config";
import { escaparHtml } from "@/lib/email/montar";
import { nomeDoBairro, plural, urlDaFoto } from "@/lib/formato";
import { qrSvg } from "@/lib/qr";
import { lerVagasDaEmpresa, totalDeVagasNoAr } from "@/lib/servidor/vagas-da-empresa";
import { linkDasVagas, valorCurto } from "@/lib/vagas-da-empresa";

// O cartaz "Estamos contratando" para imprimir em A4 e colar na porta, no balcão ou no mural (kit de divulgação):
// a logo, o nome, até 6 vagas com o valor e o bairro, e um QR Code grande que abre a página de vagas. Uma página
// solta, sem o topo do site, que já abre a janela de imprimir (ou salvar em PDF) pelo botão.

const ESTILO = `@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#e9e2d6;color:#1f1a14;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.barra{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:16px}
.barra button,.barra a{font:inherit;font-weight:600;font-size:15px;min-height:44px;padding:0 20px;border-radius:999px;border:1px solid #8a7d6b;background:#fff;color:#1f1a14;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.barra button{background:#c2410c;border-color:#c2410c;color:#fff}
.folha{width:210mm;height:297mm;overflow:hidden;margin:0 auto 32px;background:#fbf7ef;padding:16mm 16mm 14mm;display:flex;flex-direction:column;gap:7mm;box-shadow:0 2px 12px rgba(0,0,0,.12)}
.topo{display:flex;align-items:center;gap:7mm}
.logo{width:28mm;height:28mm;border-radius:7mm;object-fit:cover;background:#fff;border:1px solid #e6dccb;flex-shrink:0}
.iniciais{width:28mm;height:28mm;border-radius:6mm;background:#a2441f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12mm;font-weight:800;flex-shrink:0}
.nome{font-size:11mm;font-weight:800;line-height:1.05;margin:0}
h1{font-size:22mm;line-height:.95;margin:0;letter-spacing:-.02em}
h1 span{display:block;color:#a2441f}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2.6mm}
li{display:flex;justify-content:space-between;align-items:baseline;gap:6mm;background:#fff;border:1px solid #e6dccb;border-radius:4mm;padding:3mm 5mm;font-size:5mm}
li b{font-size:5.8mm}
li span{color:#5c5246;text-align:right;white-space:nowrap}
.mais{font-size:5.4mm;font-weight:700;color:#a2441f;margin:0}
.qr{margin-top:auto;display:flex;align-items:center;gap:8mm;background:#fff;border:1px solid #e6dccb;border-radius:6mm;padding:6mm}
.qr svg{width:48mm;height:48mm;flex-shrink:0}
.qr p{margin:0;font-size:6.4mm;line-height:1.3}
.qr strong{display:block;font-size:9mm;line-height:1.1;margin-bottom:2mm}
.qr small{display:block;color:#5c5246;font-size:4.6mm;margin-top:3mm}
@media print{html,body{background:#fbf7ef}.barra{display:none}.folha{margin:0;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

export async function GET(_request: Request, ctx: RouteContext<"/perfil/[id]/vagas/cartaz">) {
  const { id } = await ctx.params;
  const quadro = await lerVagasDaEmpresa(id).catch(() => null);
  if (!quadro) return new Response("Não encontrado", { status: 404 });
  const { perfil } = quadro;
  const vagas = quadro.vagas.map((v) => ({ ...v, tipo: "vaga" }));
  const total = await totalDeVagasNoAr(id, vagas.length);
  const mostradas = vagas.slice(0, total > 6 ? 5 : 6);
  const link = linkDasVagas(SITE_URL, id, "cartaz");
  const foto = urlDaFoto(perfil.foto);
  const logo = foto
    ? `<img class="logo" src="${escaparHtml(foto)}" alt="">`
    : `<div class="iniciais" aria-hidden="true">${escaparHtml(
        perfil.nome
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]!.toUpperCase())
          .join(""),
      )}</div>`;
  const lista = mostradas.length
    ? `<ul>${mostradas
        .map(
          (v) =>
            `<li><b>${escaparHtml(v.titulo)}</b><span>${escaparHtml(`${valorCurto(v)} · ${v.bairro ? nomeDoBairro(v.bairro) : v.cidade}`)}</span></li>`,
        )
        .join(
          "",
        )}</ul>${total > mostradas.length ? `<p class="mais">e mais ${escaparHtml(plural(total - mostradas.length, "vaga", "vagas"))} no link</p>` : ""}`
    : `<p class="mais">As vagas abertas aparecem no link, sempre em dia.</p>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Cartaz: ${escaparHtml(perfil.nome)} está contratando</title><style>${ESTILO}</style></head>
<body>
<div class="barra"><button type="button" onclick="print()">Imprimir ou salvar em PDF</button><a href="${SITE_URL}/painel/links">Voltar ao painel</a></div>
<main class="folha">
<div class="topo">${logo}<p class="nome">${escaparHtml(perfil.nome)}</p></div>
<h1>Estamos <span>contratando</span></h1>
${lista}
<div class="qr">${qrSvg(link)}<p><strong>Candidate-se de graça</strong>Aponte a câmera do celular para ver as vagas e se candidatar no Publike.<small>publike.org · ${escaparHtml(plural(total, "vaga aberta", "vagas abertas"))}</small></p></div>
</main>
</body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=60",
      "x-robots-tag": "noindex",
    },
  });
}
