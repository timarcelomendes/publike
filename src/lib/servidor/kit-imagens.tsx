import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BENEFICIOS, REGIMES } from "@/lib/constantes";
import { formatarLugar, nomeDoBairro, plural, urlDaFoto } from "@/lib/formato";
import { corLegivel, corValida } from "@/lib/marca";
import { qrDataUrl } from "@/lib/qr";
import type { Regime } from "@/lib/tipos";
import { valorCurto, type VagaParaTexto } from "@/lib/vagas-da-empresa";

/* eslint-disable @next/next/no-img-element -- o ImageResponse (Satori) só desenha <img> */

// As imagens do kit de divulgação (claude/plano-pagina-de-vagas.md, parte 2), para a empresa baixar e postar:
// o Status/Stories (1080×1920) e o post (1080×1080) com as vagas abertas, e o post de uma vaga só. Todas com a logo
// (ou as iniciais), o nome, "está contratando" e um QR Code para quem vê no celular de outra pessoa ou no papel.
// As letras são as do site (Bricolage nos títulos, Figtree no resto), lidas de src/assets/fontes.

const COR = {
  fundo: "#fbf7ef",
  cartao: "#ffffff",
  borda: "#ece3d4",
  tinta: "#1f1a14",
  apagado: "#5c5246",
  terra: "#a2441f",
  selo: "#f2ebdf",
  verde: "#2f6b3d",
};

/** `cor`: a cor da marca (página de carreiras liberada); sem ela, a terracota do Publike. */
export type Empresa = { nome: string; foto: string | null; cor?: string | null };

const destaque = (empresa: Empresa) => corLegivel(empresa.cor);
export type VagaDaImagem = VagaParaTexto & { id: string };
export type VagaSozinha = VagaDaImagem & { regime: string | null; beneficios_lista: string[]; vagas: number };

let fontes: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
/** As letras do site para o ImageResponse (também as Vagas do dia, em imagens-do-dia.tsx). */
export function lerFontes() {
  fontes ??= (async () => {
    const pasta = join(process.cwd(), "src/assets/fontes");
    const [texto, forte, titulo] = await Promise.all(
      [
        "figtree-latin-400-normal.woff",
        "figtree-latin-700-normal.woff",
        "bricolage-grotesque-latin-700-normal.woff",
      ].map((f) => readFile(join(pasta, f))),
    );
    return [
      { name: "Figtree", data: texto, weight: 400 as const, style: "normal" as const },
      { name: "Figtree", data: forte, weight: 700 as const, style: "normal" as const },
      { name: "Bricolage", data: titulo, weight: 700 as const, style: "normal" as const },
    ];
  })().catch((e) => {
    fontes = null;
    throw e;
  });
  return fontes;
}

const curto = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "P";

function Logo({ empresa, tamanho }: { empresa: Empresa; tamanho: number }) {
  const foto = urlDaFoto(empresa.foto);
  const raio = Math.round(tamanho * 0.22);
  if (foto) {
    return (
      <div
        style={{
          display: "flex",
          width: tamanho,
          height: tamanho,
          borderRadius: raio,
          background: "#fff",
          border: `3px solid ${COR.borda}`,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <img src={foto} alt="" width={tamanho} height={tamanho} style={{ objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: tamanho,
        height: tamanho,
        borderRadius: raio,
        background: destaque(empresa),
        color: "#fff",
        fontFamily: "Bricolage",
        fontSize: Math.round(tamanho * 0.4),
        flexShrink: 0,
      }}
    >
      {iniciais(empresa.nome)}
    </div>
  );
}

/** A logo, o nome e "está contratando" (com quantas vagas, quando tem). */
function Cabecalho({ empresa, total, logo, nome }: { empresa: Empresa; total: number; logo: number; nome: number }) {
  const n = curto(empresa.nome, 40);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(logo * 0.22) }}>
      <Logo empresa={empresa} tamanho={logo} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage",
            fontSize: n.length > 24 ? Math.round(nome * 0.78) : nome,
            lineHeight: 1.05,
            color: COR.tinta,
          }}
        >
          {n}
        </div>
        <div style={{ display: "flex", fontSize: Math.round(nome * 0.58), fontWeight: 700, color: destaque(empresa) }}>
          {total ? `está contratando · ${plural(total, "vaga", "vagas")}` : "está contratando"}
        </div>
      </div>
    </div>
  );
}

function LinhaDaVaga({ v, fonte }: { v: VagaDaImagem; fonte: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: COR.cartao,
        border: `3px solid ${COR.borda}`,
        borderRadius: 26,
        padding: `${Math.round(fonte * 0.55)}px ${Math.round(fonte * 0.8)}px`,
      }}
    >
      <div style={{ display: "flex", fontSize: fonte, fontWeight: 700, color: COR.tinta, lineHeight: 1.15 }}>
        {curto(v.titulo, 38)}
      </div>
      <div style={{ display: "flex", fontSize: Math.round(fonte * 0.78), color: COR.apagado }}>
        {curto(`${valorCurto(v)} · ${v.bairro ? nomeDoBairro(v.bairro) : v.cidade}`, 52)}
      </div>
    </div>
  );
}

/** O endereço para escrever à mão: "publike.org/v/apelido" com o endereço curto; senão só "publike.org". */
export function enderecoVisivel(link: string) {
  const caminho = new URL(link).pathname;
  return caminho.startsWith("/v/") ? `publike.org${caminho}` : "publike.org";
}

/** O QR Code com o convite ao lado. */
function Convite({ link, qr, fonte, texto }: { link: string; qr: number; fonte: number; texto: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(qr * 0.16),
        background: COR.cartao,
        border: `3px solid ${COR.borda}`,
        borderRadius: 30,
        padding: Math.round(qr * 0.12),
      }}
    >
      <img src={qrDataUrl(link, { margem: 1 })} alt="" width={qr} height={qr} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", fontSize: fonte, fontWeight: 700, color: COR.tinta, lineHeight: 1.2 }}>
          {texto}
        </div>
        <div style={{ display: "flex", fontSize: Math.round(fonte * 0.8), color: COR.apagado }}>
          Aponte a câmera do celular
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: Math.round(fonte * 1.1), color: COR.tinta }}>
          {enderecoVisivel(link)}
        </div>
      </div>
    </div>
  );
}

/** O fundo creme; com a cor da marca, uma faixa dela no alto. */
const base = (padding: number, empresa: Empresa) =>
  ({
    ...(corValida(empresa.cor) ? { borderTop: `18px solid ${empresa.cor}` } : {}),
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    background: COR.fundo,
    padding,
    color: COR.tinta,
    fontFamily: "Figtree",
  }) as const;

async function responder(jsx: React.ReactElement, size: { width: number; height: number }, arquivo: string | null) {
  return new ImageResponse(jsx, {
    ...size,
    fonts: await lerFontes(),
    headers: {
      "cache-control": "public, max-age=300, s-maxage=900",
      ...(arquivo ? { "content-disposition": `attachment; filename="${arquivo}"` } : {}),
    },
  });
}

/** Status e Stories (1080×1920): até 6 vagas, "e mais N" e o QR Code. */
export async function imagemStatus(
  empresa: Empresa,
  vagas: VagaDaImagem[],
  total: number,
  link: string,
  arquivo: string | null,
) {
  const mostradas = vagas.slice(0, 6);
  // com poucas vagas, letras maiores: a tela do Status é alta e ficava vazia no meio
  const fonte = mostradas.length <= 3 ? 54 : 44;
  return responder(
    <div style={base(80, empresa)}>
      <Cabecalho empresa={empresa} total={total} logo={176} nome={72} />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 96, lineHeight: 1, marginBottom: 18 }}>
          Vagas abertas
        </div>
        {mostradas.length ? (
          mostradas.map((v) => <LinhaDaVaga key={v.id} v={v} fonte={fonte} />)
        ) : (
          <div style={{ display: "flex", fontSize: 44, color: COR.apagado }}>As vagas novas aparecem no link.</div>
        )}
        {total > mostradas.length && (
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: destaque(empresa), paddingLeft: 8 }}>
            {`e mais ${plural(total - mostradas.length, "vaga", "vagas")}`}
          </div>
        )}
      </div>
      <Convite link={link} qr={250} fonte={42} texto="Candidate-se de graça" />
    </div>,
    { width: 1080, height: 1920 },
    arquivo,
  );
}

/** Post do feed (1080×1080): até 4 vagas e o QR Code. */
export async function imagemPost(
  empresa: Empresa,
  vagas: VagaDaImagem[],
  total: number,
  link: string,
  arquivo: string | null,
) {
  const mostradas = vagas.slice(0, total > 4 ? 3 : 4);
  return responder(
    <div style={base(64, empresa)}>
      <Cabecalho empresa={empresa} total={total} logo={128} nome={60} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {mostradas.map((v) => (
          <LinhaDaVaga key={v.id} v={v} fonte={36} />
        ))}
        {total > mostradas.length && (
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: destaque(empresa), paddingLeft: 8 }}>
            {`e mais ${plural(total - mostradas.length, "vaga", "vagas")}`}
          </div>
        )}
      </div>
      <Convite link={link} qr={170} fonte={34} texto="Candidate-se de graça" />
    </div>,
    { width: 1080, height: 1080 },
    arquivo,
  );
}

/** Post de uma vaga só (1080×1080): o cargo grande, o valor, o lugar, a contratação e até 3 benefícios. */
export async function imagemDaVaga(empresa: Empresa, v: VagaSozinha, link: string, arquivo: string | null) {
  const titulo = curto(v.titulo, 60);
  const selos = [
    v.regime && REGIMES[v.regime as Regime]?.selo,
    v.vagas > 1 ? `${v.vagas} vagas` : null,
    ...v.beneficios_lista.map((b) => BENEFICIOS.find((x) => x.valor === b)?.nome).filter(Boolean),
  ]
    .filter((s): s is string => Boolean(s))
    .slice(0, 4);
  return responder(
    <div style={base(64, empresa)}>
      <Cabecalho empresa={empresa} total={0} logo={112} nome={52} />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: destaque(empresa) }}>VAGA DE EMPREGO</div>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage",
            fontSize: titulo.length > 30 ? 72 : 92,
            lineHeight: 1.02,
          }}
        >
          {titulo}
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{valorCurto(v)}</div>
        <div style={{ display: "flex", fontSize: 36, color: COR.apagado }}>{formatarLugar(v.bairro, v.cidade)}</div>
        {selos.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {selos.map((s) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 700,
                  background: COR.selo,
                  borderRadius: 999,
                  padding: "8px 22px",
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
      <Convite link={link} qr={160} fonte={34} texto="Candidate-se de graça" />
    </div>,
    { width: 1080, height: 1080 },
    arquivo,
  );
}

/** "loja-bom-preco": para o nome do arquivo baixado. */
export function nomeDeArquivo(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "vagas"
  );
}
