import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BENEFICIOS, REGIMES } from "@/lib/constantes";
import { nomeDoBairro, plural, valorCurto } from "@/lib/formato";
import { lerFontes, nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { montarZip, type ArquivoDoZip } from "@/lib/servidor/zip";
import type { Regime } from "@/lib/tipos";
import { valorEmDuas } from "@/lib/valor-do-tiquete";
import { legendaDoDia, textoDosLinks, type VagaDoDia } from "@/lib/vagas-do-dia";

/* eslint-disable @next/next/no-img-element -- o ImageResponse (Satori) só desenha <img> */

// As imagens de Admin › Vagas do dia (src/lib/vagas-do-dia.ts), na marca do Publike: o carrossel do feed em
// 1080 × 1350 (a capa, uma vaga por imagem e o "como se candidatar") e um story por vaga em 1080 × 1920, com o
// espaço do adesivo de link embaixo e o conteúdo longe das bordas que o Instagram cobre. As letras são as do site
// (Bricolage nos títulos, Figtree no resto), as mesmas do kit de divulgação.

const COR = {
  fundo: "#fbf7ef",
  cartao: "#ffffff",
  borda: "#e3d9c8",
  tinta: "#1f1a14",
  apagado: "#6b6052",
  terra: "#c2410c",
  terraTexto: "#a8380a",
  terraSuave: "#fbe3d4",
  selo: "#f2ebdf",
  ipe: "#f5b301",
  cerrado: "#1f6f4a",
  like: "#b3121f",
};

const FEED = { width: 1080, height: 1350 };
const STORY = { width: 1080, height: 1920 };

// a logo colorida (pino e palavra em tinta, check vermelho), lida uma vez
let logo: Promise<string> | null = null;
function lerLogo() {
  logo ??= readFile(join(process.cwd(), "public/logo/publike-logo.svg"))
    .then((svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`)
    .catch((e) => {
      logo = null;
      throw e;
    });
  return logo;
}
/** A logo tem 659 × 217. */
const larguraDaLogo = (altura: number) => Math.round((altura * 659) / 217);

// ícones do lucide, desenhados como imagem (o Satori não pinta o <svg> com traço do mesmo jeito)
function icone(corpo: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
const PINO = icone(
  '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  COR.terraTexto,
);
const CONFERIDA = icone('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', COR.cerrado);
const PARA_O_LADO = icone('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', COR.terraTexto);
const PARA_BAIXO = icone('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>', COR.terraTexto);

/** Corta no fim de uma palavra ("…Internet, Aparecida de…"), sem deixar vírgula ou traço pendurado. */
function curto(t: string, max: number) {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}
const maiuscula = (t: string) => t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);

/** "Setor Bueno, Goiânia" (no Instagram, a cidade sempre vai junto). */
function lugar(v: VagaDoDia) {
  return !v.bairro || v.bairro === v.cidade ? v.cidade : `${nomeDoBairro(v.bairro)}, ${v.cidade}`;
}

/** O valor grande e, embaixo, o que ele quer dizer ("até R$ 2.100 · por mês", "+ comissão"). */
function valor(v: VagaDoDia) {
  const d = valorEmDuas({ ...v, tipo: "vaga" });
  const extra = v.comissao && d.unidade ? " + comissão" : "";
  return { grande: d.valor, embaixo: d.unidade ? `${d.unidade}${extra}` : null };
}

/** CLT, "Começa já" e "3 vagas". */
function selosDa(v: VagaDoDia) {
  return [
    v.regime ? (REGIMES[v.regime as Regime]?.selo ?? null) : null,
    v.comeca_ja ? "Começa já" : null,
    v.vagas > 1 ? `${v.vagas} vagas` : null,
  ].filter((s): s is string => Boolean(s));
}

/** Até 4 benefícios marcados, pelo nome. */
function beneficiosDa(v: VagaDoDia) {
  return v.beneficios_lista
    .map((b) => BENEFICIOS.find((x) => x.valor === b)?.nome)
    .filter((b): b is (typeof BENEFICIOS)[number]["nome"] => Boolean(b))
    .slice(0, 4);
}

/** O título grande: quanto mais comprido, menor a letra. */
function tamanhoDoTitulo(titulo: string, maior: number) {
  if (titulo.length <= 18) return maior;
  if (titulo.length <= 30) return Math.round(maior * 0.84);
  if (titulo.length <= 46) return Math.round(maior * 0.7);
  return Math.round(maior * 0.6);
}

function Etiqueta({ texto, fonte, forte = false }: { texto: string; fonte: number; forte?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: fonte,
        fontWeight: 700,
        background: forte ? COR.tinta : COR.selo,
        color: forte ? COR.fundo : COR.tinta,
        borderRadius: 999,
        padding: `${Math.round(fonte * 0.28)}px ${Math.round(fonte * 0.75)}px`,
      }}
    >
      {texto}
    </div>
  );
}

/** O miolo de uma vaga, igual no feed e no story; `escala` aumenta tudo no story. */
function Vaga({ v, escala }: { v: VagaDoDia; escala: number }) {
  const t = (n: number) => Math.round(n * escala);
  const titulo = curto(v.titulo, 70);
  const selos = selosDa(v);
  const beneficios = beneficiosDa(v);
  const { grande, embaixo } = valor(v);
  const conferida = v.verificada && !v.agencia && v.quem !== "Empresa confidencial";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t(30) }}>
      {selos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: t(12) }}>
          {selos.map((s, i) => (
            <Etiqueta key={s} texto={s} fonte={t(30)} forte={i === 0} />
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: "Bricolage",
          fontSize: tamanhoDoTitulo(titulo, t(118)),
          lineHeight: 1,
          letterSpacing: -2,
        }}
      >
        {titulo}
      </div>
      {(v.quem || v.agencia) && (
        <div style={{ display: "flex", flexDirection: "column", gap: t(6) }}>
          {v.quem && (
            <div style={{ display: "flex", alignItems: "center", gap: t(12) }}>
              <div style={{ display: "flex", fontSize: t(40), fontWeight: 700 }}>{curto(v.quem, 40)}</div>
              {conferida && <img src={CONFERIDA} alt="" width={t(38)} height={t(38)} />}
            </div>
          )}
          {v.agencia && (
            <div style={{ display: "flex", alignItems: "center", gap: t(10) }}>
              <div style={{ display: "flex", fontSize: t(32), color: COR.apagado }}>
                {`Pela agência ${curto(v.agencia, 30)}`}
              </div>
              {v.verificada && <img src={CONFERIDA} alt="" width={t(30)} height={t(30)} />}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: t(4) }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: t(88), lineHeight: 1.05 }}>{grande}</div>
        {embaixo && <div style={{ display: "flex", fontSize: t(36), color: COR.apagado }}>{embaixo}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: t(14) }}>
        <img src={PINO} alt="" width={t(44)} height={t(44)} />
        <div style={{ display: "flex", fontSize: t(42), fontWeight: 700 }}>{curto(lugar(v), 44)}</div>
      </div>
      {beneficios.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: t(12) }}>
          {beneficios.map((b) => (
            <Etiqueta key={b} texto={b} fonte={t(28)} />
          ))}
        </div>
      )}
    </div>
  );
}

const fundo = (padding: string | number) =>
  ({
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

function Pilula({ texto, fonte, cor = "branca" }: { texto: string; fonte: number; cor?: "branca" | "ipe" }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: fonte,
        fontWeight: 700,
        letterSpacing: cor === "ipe" ? 1 : 0,
        background: cor === "ipe" ? COR.ipe : COR.cartao,
        border: cor === "ipe" ? "none" : `3px solid ${COR.borda}`,
        borderRadius: 999,
        padding: `${Math.round(fonte * 0.3)}px ${Math.round(fonte * 0.8)}px`,
      }}
    >
      {texto}
    </div>
  );
}

async function imagem(jsx: React.ReactElement, tamanho: { width: number; height: number }, arquivo: string | null) {
  return new ImageResponse(jsx, {
    ...tamanho,
    fonts: await lerFontes(),
    headers: {
      // gerada na hora, com as vagas de agora: o admin não guarda
      "cache-control": "private, no-store",
      ...(arquivo ? { "content-disposition": `attachment; filename="${arquivo}"` } : {}),
    },
  });
}

/** A capa do carrossel: "Vagas do dia", quantas, o dia e as 4 primeiras. */
export async function capaDoDia(vagas: VagaDoDia[], dia: string, arquivo: string | null = null) {
  const mostradas = vagas.slice(0, 4);
  const resto = vagas.length - mostradas.length;
  const altura = 62;
  return imagem(
    <div style={fundo(72)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={await lerLogo()} alt="" width={larguraDaLogo(altura)} height={altura} />
        <Pilula texto="GRÁTIS PARA SE CANDIDATAR" fonte={28} cor="ipe" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 150, lineHeight: 0.92, letterSpacing: -4 }}>
          Vagas do dia
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 56, color: COR.terra, lineHeight: 1.1 }}>
          {vagas.length ? `${plural(vagas.length, "vaga", "vagas")} em Goiânia e região` : "em Goiânia e região"}
        </div>
        <div style={{ display: "flex", fontSize: 38, color: COR.apagado }}>{maiuscula(dia)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {mostradas.map((v) => (
          <div
            key={v.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: COR.cartao,
              border: `3px solid ${COR.borda}`,
              borderRadius: 28,
              padding: "20px 30px",
            }}
          >
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>{curto(v.titulo, 38)}</div>
            <div style={{ display: "flex", fontSize: 31, color: COR.apagado }}>
              {curto(`${valorCurto(v.pagamento_valor, v.pagamento_unidade)} · ${lugar(v)}`, 56)}
            </div>
          </div>
        ))}
        {resto > 0 && (
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: COR.terraTexto, paddingLeft: 8 }}>
            {`e mais ${plural(resto, "vaga", "vagas")}`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: COR.terraTexto }}>Arraste para o lado</div>
          <img src={PARA_O_LADO} alt="" width={48} height={48} />
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 40 }}>publike.org</div>
      </div>
    </div>,
    FEED,
    arquivo,
  );
}

/** Uma vaga do carrossel, com "Vaga 3 de 12" (o número da legenda) e o convite embaixo. */
export async function vagaDoDia(v: VagaDoDia, n: number, total: number, arquivo: string | null = null) {
  const altura = 52;
  return imagem(
    <div style={fundo(72)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={await lerLogo()} alt="" width={larguraDaLogo(altura)} height={altura} />
        <Pilula texto={`Vaga ${n} de ${total}`} fonte={30} />
      </div>
      <Vaga v={v} escala={1} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          background: COR.cartao,
          border: `3px solid ${COR.borda}`,
          borderRadius: 30,
          padding: "26px 34px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>Quer essa vaga?</div>
          <div style={{ display: "flex", fontSize: 30, color: COR.apagado }}>
            Toque no link da bio e curta a vaga. É de graça.
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 38, color: COR.terraTexto }}>publike.org</div>
      </div>
    </div>,
    FEED,
    arquivo,
  );
}

const PASSOS = [
  { titulo: "Toque no link da bio", texto: "As vagas estão no Publike, perto de você." },
  { titulo: "Entre de graça", texto: "Sem senha e sem taxa nenhuma." },
  { titulo: "Curta a vaga", texto: "A empresa recebe na hora. Se aceitar, vocês conversam." },
];

/** O fechamento do carrossel: como se candidatar, o pedido para mandar a quem procura e o aviso contra golpe. */
export async function fimDoDia(arquivo: string | null = null) {
  const altura = 56;
  return imagem(
    <div style={fundo(72)}>
      <img src={await lerLogo()} alt="" width={larguraDaLogo(altura)} height={altura} />
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 112, lineHeight: 0.95, letterSpacing: -3 }}>
          Como se candidatar
        </div>
        {PASSOS.map((p, i) => (
          <div key={p.titulo} style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 92,
                height: 92,
                borderRadius: 999,
                background: COR.terra,
                color: "#ffffff",
                fontFamily: "Bricolage",
                fontSize: 52,
                flexShrink: 0,
              }}
            >
              {String(i + 1)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>{p.titulo}</div>
              <div style={{ display: "flex", fontSize: 34, color: COR.apagado }}>{p.texto}</div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: COR.terraSuave,
          borderRadius: 32,
          padding: "30px 38px",
        }}
      >
        <div style={{ display: "flex", fontSize: 42, fontWeight: 700 }}>Conhece alguém procurando trabalho?</div>
        <div style={{ display: "flex", fontSize: 34 }}>Mande este post. Indicar ajuda muito.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: COR.like }}>
          Nunca pague para conseguir trabalho.
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 40 }}>publike.org</div>
      </div>
    </div>,
    FEED,
    arquivo,
  );
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * O "Baixar tudo": o carrossel numerado na ordem de postar (carrossel/01-capa.png … o "como se candidatar" por
 * último), um story por vaga (stories/), a legenda e os links dos adesivos, num .zip.
 */
export async function pacoteDoDia(vagas: VagaDoDia[], dia: string, site: string, quando: Date) {
  const total = vagas.length;
  // uma imagem por vez: o desenho usa o processador, e em paralelo não fica mais rápido
  const png = async (pedido: Promise<Response>) => new Uint8Array(await (await pedido).arrayBuffer());
  const arquivos: ArquivoDoZip[] = [{ nome: "carrossel/01-capa.png", dados: await png(capaDoDia(vagas, dia)) }];
  for (const [i, v] of vagas.entries()) {
    arquivos.push({
      nome: `carrossel/${doisDigitos(i + 2)}-${nomeDeArquivo(v.titulo)}.png`,
      dados: await png(vagaDoDia(v, i + 1, total)),
    });
  }
  arquivos.push({ nome: `carrossel/${doisDigitos(total + 2)}-como-se-candidatar.png`, dados: await png(fimDoDia()) });
  for (const [i, v] of vagas.entries()) {
    arquivos.push({ nome: `stories/${doisDigitos(i + 1)}-${nomeDeArquivo(v.titulo)}.png`, dados: await png(storyDoDia(v)) });
  }
  const texto = new TextEncoder();
  arquivos.push({ nome: "legenda.txt", dados: texto.encode(`${legendaDoDia(vagas, dia)}\n`) });
  arquivos.push({ nome: "links-dos-stories.txt", dados: texto.encode(textoDosLinks(vagas, site)) });
  return montarZip(arquivos, quando);
}

/**
 * O story de uma vaga (1080 × 1920). O Instagram cobre o alto (o nome do perfil) e o pé (a resposta): o conteúdo
 * fica no meio, e embaixo do "Toque no link" sobra o lugar do adesivo de link, que leva à página da vaga.
 */
export async function storyDoDia(v: VagaDoDia, arquivo: string | null = null) {
  const altura = 70;
  return imagem(
    <div style={fundo("210px 72px 110px")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={await lerLogo()} alt="" width={larguraDaLogo(altura)} height={altura} />
        <Pilula texto="VAGA DO DIA" fonte={32} cor="ipe" />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: COR.cartao,
          border: `4px solid ${COR.borda}`,
          borderRadius: 52,
          padding: "60px 56px",
        }}
      >
        <Vaga v={v} escala={1.08} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, minHeight: 360 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: COR.terraTexto }}>
          Toque no link e candidate-se
        </div>
        <img src={PARA_BAIXO} alt="" width={64} height={64} />
      </div>
    </div>,
    STORY,
    arquivo,
  );
}
