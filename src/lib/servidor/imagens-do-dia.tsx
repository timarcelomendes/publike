import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BENEFICIOS, REGIMES } from "@/lib/constantes";
import { nomeDoBairro, plural, urlDaFoto, valorCurto } from "@/lib/formato";
import { corLegivel, corValida, textoSobre } from "@/lib/marca";
import { lerFontes, nomeDeArquivo } from "@/lib/servidor/kit-imagens";
import { montarZip, type ArquivoDoZip } from "@/lib/servidor/zip";
import type { Regime } from "@/lib/tipos";
import { valorEmDuas } from "@/lib/valor-do-tiquete";
import { textoDosLinks, type VagaDoDia } from "@/lib/vagas-do-dia";

/* eslint-disable @next/next/no-img-element -- o ImageResponse (Satori) só desenha <img> */

// O carrossel e os stories do Instagram (src/lib/vagas-do-dia.ts): o carrossel do feed em 1080 × 1350 (a capa,
// uma vaga por imagem e o "como se candidatar") e um story por vaga em 1080 × 1920, com o espaço do adesivo de
// link embaixo e o conteúdo longe das bordas que o Instagram cobre. Duas assinaturas: a do Publike (Admin › Vagas
// do dia, "Vagas do dia") e a da empresa (o kit de divulgação, "Estamos contratando", com a logo, o nome e a cor da
// marca quando a página de carreiras está liberada). As letras são as do site, as mesmas do kit.

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

/** Quem assina as imagens: o Publike ou a empresa (com o endereço curto da página de vagas, "publike.org/v/…"). */
export type Assinatura =
  | { tipo: "publike" }
  | { tipo: "empresa"; nome: string; foto: string | null; cor: string | null; endereco: string };

export const DO_PUBLIKE: Assinatura = { tipo: "publike" };

/** A cor de destaque: a da marca (legível no creme) ou a terracota do Publike. */
function destaque(a: Assinatura) {
  return a.tipo === "empresa" && corValida(a.cor) ? corLegivel(a.cor) : COR.terraTexto;
}
/** O fundo do número dos passos e da faixa do topo: a cor da marca como ela é. */
function corCheia(a: Assinatura) {
  return a.tipo === "empresa" && corValida(a.cor) ? a.cor : COR.terra;
}
const endereco = (a: Assinatura) => (a.tipo === "empresa" ? a.endereco : "publike.org");

// a logo colorida do Publike (pino e palavra em tinta, check vermelho), lida uma vez
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
/** A logo do Publike só na assinatura dele. */
const logoDa = async (a: Assinatura) => (a.tipo === "publike" ? lerLogo() : "");
/** A logo tem 659 × 217. */
const larguraDaLogo = (altura: number) => Math.round((altura * 659) / 217);

// ícones do lucide, desenhados como imagem
function icone(corpo: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
const pino = (cor: string) =>
  icone(
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    cor,
  );
const CONFERIDA = icone('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', COR.cerrado);
const paraOLado = (cor: string) => icone('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', cor);
const paraBaixo = (cor: string) => icone('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>', cor);

/** Corta no fim de uma palavra ("…Internet, Aparecida de…"), sem deixar vírgula ou traço pendurado. */
function curto(t: string, max: number) {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}
const maiuscula = (t: string) => t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "P";

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

/** A logo da empresa (a foto do perfil) ou as iniciais na cor da marca. */
function LogoDaEmpresa({ a, tamanho }: { a: Extract<Assinatura, { tipo: "empresa" }>; tamanho: number }) {
  const foto = urlDaFoto(a.foto);
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
  const fundo = corCheia(a);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: tamanho,
        height: tamanho,
        borderRadius: raio,
        background: fundo,
        color: textoSobre(fundo),
        fontFamily: "Bricolage",
        fontSize: Math.round(tamanho * 0.4),
        flexShrink: 0,
      }}
    >
      {iniciais(a.nome)}
    </div>
  );
}

/** O alto de cada imagem: a logo do Publike (`logo`, lida antes: o Satori não espera) ou a logo e o nome da empresa. */
function Topo({ a, altura, direita, logo }: { a: Assinatura; altura: number; direita: React.ReactNode; logo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
      {a.tipo === "publike" ? (
        <img src={logo} alt="" width={larguraDaLogo(altura)} height={altura} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(altura * 0.3), flex: 1, minWidth: 0 }}>
          <LogoDaEmpresa a={a} tamanho={Math.round(altura * 1.5)} />
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: Math.round(altura * 0.72), lineHeight: 1.05 }}>
            {curto(a.nome, 30)}
          </div>
        </div>
      )}
      {direita}
    </div>
  );
}

/** O miolo de uma vaga, igual no feed e no story; `escala` aumenta tudo no story. */
function Vaga({ v, escala, a }: { v: VagaDoDia; escala: number; a: Assinatura }) {
  const t = (n: number) => Math.round(n * escala);
  const titulo = curto(v.titulo, 70);
  const selos = selosDa(v);
  const beneficios = beneficiosDa(v);
  const { grande, embaixo } = valor(v);
  // na imagem da empresa, o nome dela já está no alto: aqui fica só o cliente da agência
  const daMarca = a.tipo === "empresa";
  const quem = daMarca && v.quem === a.nome ? null : v.quem;
  const agencia = daMarca ? null : v.agencia;
  const conferida = !daMarca && v.verificada && !v.agencia && v.quem !== "Empresa confidencial";
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
      {(quem || agencia) && (
        <div style={{ display: "flex", flexDirection: "column", gap: t(6) }}>
          {quem && (
            <div style={{ display: "flex", alignItems: "center", gap: t(12) }}>
              <div style={{ display: "flex", fontSize: t(40), fontWeight: 700 }}>
                {daMarca && quem !== "Empresa confidencial" ? `Para ${curto(quem, 36)}` : curto(quem, 40)}
              </div>
              {conferida && <img src={CONFERIDA} alt="" width={t(38)} height={t(38)} />}
            </div>
          )}
          {agencia && (
            <div style={{ display: "flex", alignItems: "center", gap: t(10) }}>
              <div style={{ display: "flex", fontSize: t(32), color: COR.apagado }}>
                {`Pela agência ${curto(agencia, 30)}`}
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
        <img src={pino(destaque(a))} alt="" width={t(44)} height={t(44)} />
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

/** O fundo creme; com a cor da marca, uma faixa dela no alto. */
const fundo = (padding: string | number, a: Assinatura) =>
  ({
    ...(a.tipo === "empresa" && corValida(a.cor) ? { borderTop: `18px solid ${a.cor}` } : {}),
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
        flexShrink: 0,
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
      // desenhada na hora, com as vagas de agora
      "cache-control": "private, no-store",
      ...(arquivo ? { "content-disposition": `attachment; filename="${arquivo}"` } : {}),
    },
  });
}

/** A capa do carrossel: "Vagas do dia" (Publike) ou "Estamos contratando" (empresa), quantas e as 4 primeiras. */
export async function capaDoDia(vagas: VagaDoDia[], dia: string, a: Assinatura = DO_PUBLIKE, arquivo: string | null = null) {
  const mostradas = vagas.slice(0, 4);
  const resto = vagas.length - mostradas.length;
  const publike = a.tipo === "publike";
  const quantas = vagas.length ? plural(vagas.length, publike ? "vaga" : "vaga aberta", publike ? "vagas" : "vagas abertas") : "";
  return imagem(
    <div style={fundo(72, a)}>
      <Topo
        logo={await logoDa(a)}
        a={a}
        altura={publike ? 62 : 56}
        direita={<Pilula texto={publike ? "GRÁTIS PARA SE CANDIDATAR" : "CANDIDATE-SE DE GRAÇA"} fonte={26} cor="ipe" />}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage",
            fontSize: publike ? 150 : 128,
            lineHeight: 0.92,
            letterSpacing: -4,
          }}
        >
          {publike ? "Vagas do dia" : "Estamos contratando"}
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 56, color: destaque(a), lineHeight: 1.1 }}>
          {publike ? (quantas ? `${quantas} em Goiânia e região` : "em Goiânia e região") : quantas}
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
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: destaque(a), paddingLeft: 8 }}>
            {`e mais ${plural(resto, "vaga", "vagas")}`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: destaque(a) }}>Arraste para o lado</div>
          <img src={paraOLado(destaque(a))} alt="" width={48} height={48} />
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 36 }}>{endereco(a)}</div>
      </div>
    </div>,
    FEED,
    arquivo,
  );
}

/** Uma vaga do carrossel, com "Vaga 3 de 12" (o número da legenda) e o convite embaixo. */
export async function vagaDoDia(
  v: VagaDoDia,
  n: number,
  total: number,
  a: Assinatura = DO_PUBLIKE,
  arquivo: string | null = null,
) {
  return imagem(
    <div style={fundo(72, a)}>
      <Topo logo={await logoDa(a)} a={a} altura={a.tipo === "publike" ? 52 : 44} direita={<Pilula texto={`Vaga ${n} de ${total}`} fonte={30} />} />
      <Vaga v={v} escala={1} a={a} />
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
            {a.tipo === "publike" ? "Toque no link da bio e curta a vaga. É de graça." : "Toque no link da bio. É de graça."}
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: a.tipo === "publike" ? 38 : 30, color: destaque(a) }}>
          {endereco(a)}
        </div>
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
export async function fimDoDia(a: Assinatura = DO_PUBLIKE, arquivo: string | null = null) {
  const cheia = corCheia(a);
  return imagem(
    <div style={fundo(72, a)}>
      <Topo logo={await logoDa(a)} a={a} altura={a.tipo === "publike" ? 56 : 44} direita={null} />
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
                background: cheia,
                color: textoSobre(cheia),
                fontFamily: "Bricolage",
                fontSize: 52,
                flexShrink: 0,
              }}
            >
              {String(i + 1)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>{p.titulo}</div>
              <div style={{ display: "flex", fontSize: 34, color: COR.apagado }}>
                {i === 2 && a.tipo === "empresa" ? "Recebemos na hora e respondemos por lá." : p.texto}
              </div>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: COR.like }}>
          Nunca pague para conseguir trabalho.
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: a.tipo === "publike" ? 40 : 30 }}>
          {endereco(a)}
        </div>
      </div>
    </div>,
    FEED,
    arquivo,
  );
}

/**
 * O story de uma vaga (1080 × 1920). O Instagram cobre o alto (o nome do perfil) e o pé (a resposta): o conteúdo
 * fica no meio, e embaixo do "Toque no link" sobra o lugar do adesivo de link, que leva à página da vaga.
 */
export async function storyDoDia(v: VagaDoDia, a: Assinatura = DO_PUBLIKE, arquivo: string | null = null) {
  return imagem(
    <div style={fundo("210px 72px 110px", a)}>
      <Topo
        logo={await logoDa(a)}
        a={a}
        altura={a.tipo === "publike" ? 70 : 56}
        direita={<Pilula texto={a.tipo === "publike" ? "VAGA DO DIA" : "VAGA ABERTA"} fonte={32} cor="ipe" />}
      />
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
        <Vaga v={v} escala={1.08} a={a} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, minHeight: 360 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: destaque(a) }}>
          Toque no link e candidate-se
        </div>
        <img src={paraBaixo(destaque(a))} alt="" width={64} height={64} />
      </div>
    </div>,
    STORY,
    arquivo,
  );
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * O "Baixar tudo": o carrossel numerado na ordem de postar (carrossel/01-capa.png … o "como se candidatar" por
 * último), um story por vaga (stories/), a legenda e os links dos adesivos, num .zip.
 */
export async function pacoteDoDia(
  vagas: VagaDoDia[],
  dia: string,
  a: Assinatura,
  textos: { legenda: string; bio: string; linkDoStory: (id: string) => string },
  quando: Date,
) {
  const total = vagas.length;
  // uma imagem por vez: o desenho usa o processador, e em paralelo não fica mais rápido
  const png = async (pedido: Promise<Response>) => new Uint8Array(await (await pedido).arrayBuffer());
  const arquivos: ArquivoDoZip[] = [{ nome: "carrossel/01-capa.png", dados: await png(capaDoDia(vagas, dia, a)) }];
  for (const [i, v] of vagas.entries()) {
    arquivos.push({
      nome: `carrossel/${doisDigitos(i + 2)}-${nomeDeArquivo(v.titulo)}.png`,
      dados: await png(vagaDoDia(v, i + 1, total, a)),
    });
  }
  arquivos.push({ nome: `carrossel/${doisDigitos(total + 2)}-como-se-candidatar.png`, dados: await png(fimDoDia(a)) });
  for (const [i, v] of vagas.entries()) {
    arquivos.push({ nome: `stories/${doisDigitos(i + 1)}-${nomeDeArquivo(v.titulo)}.png`, dados: await png(storyDoDia(v, a)) });
  }
  const texto = new TextEncoder();
  arquivos.push({ nome: "legenda.txt", dados: texto.encode(`${textos.legenda}\n`) });
  arquivos.push({ nome: "links-dos-stories.txt", dados: texto.encode(textoDosLinks(vagas, textos.linkDoStory, textos.bio)) });
  return montarZip(arquivos, quando);
}

