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
import { emTrios, textoDosLinks, textoDosLinksDosTrios, type TextoDaCapa, type VagaDoDia } from "@/lib/vagas-do-dia";

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
export async function capaDoDia(
  vagas: VagaDoDia[],
  dia: string,
  a: Assinatura = DO_PUBLIKE,
  arquivo: string | null = null,
  /** o título, onde e quando (Admin › Vagas do dia; sem ele, "Vagas do dia" em Goiânia e região, hoje) */
  texto?: TextoDaCapa,
) {
  const titulo = texto?.titulo ?? "Vagas do dia";
  const onde = texto?.lugar ?? "Goiânia e região";
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
            fontSize: publike ? tamanhoDoTitulo(titulo, 150) : 128,
            lineHeight: 0.92,
            letterSpacing: -4,
          }}
        >
          {publike ? titulo : "Estamos contratando"}
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 56, color: destaque(a), lineHeight: 1.1 }}>
          {publike ? (quantas ? `${quantas} em ${onde}` : `em ${onde}`) : quantas}
        </div>
        <div style={{ display: "flex", fontSize: 38, color: COR.apagado }}>{maiuscula(texto?.quando ?? dia)}</div>
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

/** As cores das iniciais de quem publicou, quando não tem logo (a mesma conta, sempre a mesma cor). */
const CORES_DAS_INICIAIS = [COR.terra, COR.cerrado, "#7c3aed", "#0f766e", "#b45309", "#1d4ed8"];
function corDasIniciais(nome: string) {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + (letra.codePointAt(0) ?? 0)) % 9973;
  return CORES_DAS_INICIAIS[soma % CORES_DAS_INICIAIS.length]!;
}

/** A logo de quem publicou (a foto do perfil) ou as iniciais coloridas; pessoa física, redonda e sem nome. */
function LogoDaVaga({ v, tamanho }: { v: VagaDoDia; tamanho: number }) {
  const foto = urlDaFoto(v.foto ?? null);
  const nome = v.quem ?? v.titulo;
  const raio = v.quem ? Math.round(tamanho * 0.24) : tamanho;
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
        background: corDasIniciais(nome),
        color: "#fff",
        fontFamily: "Bricolage",
        fontSize: Math.round(tamanho * 0.4),
        flexShrink: 0,
      }}
    >
      {iniciais(nome)}
    </div>
  );
}

/** Os giros dos cartões, como a pilha de vagas do alto da inicial do site. */
const GIROS_DO_TRIO = [-2, 1.5, -1];

/**
 * Três vagas num story só (1080 × 1920), como a pilha de vagas do alto da inicial do site: cada uma num cartão
 * levemente girado, com a logo de quem publicou, o título, quem e onde, e o valor. O adesivo de link vai embaixo,
 * com o link de todas as vagas (são três: não há uma página só). `n` e `total`: "1/4" no selo (opcional: com
 * `numero` false, ou com um story só, o selo do período, "HOJE" ou "VAGAS NOVAS").
 */
export async function storyTrioDoDia(
  vagas: VagaDoDia[],
  n: number,
  total: number,
  a: Assinatura = DO_PUBLIKE,
  arquivo: string | null = null,
  texto?: TextoDaCapa,
  numero = true,
) {
  const publike = a.tipo === "publike";
  const titulo = texto?.titulo ?? "Vagas do dia";
  return imagem(
    <div style={fundo("210px 72px 110px", a)}>
      <Topo
        logo={await logoDa(a)}
        a={a}
        altura={publike ? 70 : 56}
        direita={<Pilula texto={numero && total > 1 ? `${n}/${total}` : (texto?.selo ?? "HOJE")} fonte={32} cor="ipe" />}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage",
            fontSize: tamanhoDoTitulo(publike ? titulo : "Estamos contratando", 112),
            lineHeight: 0.95,
            letterSpacing: -3,
          }}
        >
          {publike ? titulo : "Estamos contratando"}
        </div>
        {publike && (
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 50, color: destaque(a), lineHeight: 1.1 }}>
            em {texto?.lugar ?? "Goiânia e região"}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 34, padding: "0 6px" }}>
        {vagas.slice(0, 3).map((v, i) => {
          const { grande } = valor(v);
          const quem = publike ? v.quem : null;
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 30,
                background: COR.cartao,
                border: `3px solid ${COR.borda}`,
                borderRadius: 40,
                padding: "34px 34px",
                boxShadow: "0 18px 40px rgba(31, 26, 20, 0.12)",
                transform: `rotate(${GIROS_DO_TRIO[i]}deg)`,
              }}
            >
              <LogoDaVaga v={v} tamanho={112} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 50, lineHeight: 1.05 }}>
                  {curto(v.titulo, 40)}
                </div>
                <div style={{ display: "flex", fontSize: 32, color: COR.apagado }}>
                  {curto(quem ? `${quem} · ${lugar(v)}` : lugar(v), 44)}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignSelf: "flex-start",
                    marginTop: 6,
                    background: COR.selo,
                    color: COR.cerrado,
                    borderRadius: 999,
                    padding: "6px 20px",
                    fontSize: 32,
                    fontWeight: 700,
                  }}
                >
                  {curto(grande, 30)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, minHeight: 300 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: destaque(a) }}>
          Toque no link e veja as vagas
        </div>
        <img src={paraBaixo(destaque(a))} alt="" width={64} height={64} />
      </div>
    </div>,
    STORY,
    arquivo,
  );
}

/**
 * A capa dos stories (1080 × 1920), antes do primeiro: "Vagas de hoje" (Publike) ou "Estamos contratando" (empresa),
 * quantas e as primeiras, com o "toque para ver" (no story, tocar passa para o próximo).
 */
export async function storyCapaDoDia(
  vagas: VagaDoDia[],
  dia: string,
  a: Assinatura = DO_PUBLIKE,
  arquivo: string | null = null,
  /** o título, onde, quando e o selo (Admin › Vagas do dia; sem ele, "Vagas de hoje" em Goiânia e região) */
  texto?: TextoDaCapa,
) {
  const titulo = texto?.titulo ?? "Vagas de hoje";
  const onde = texto?.lugar ?? "Goiânia e região";
  const publike = a.tipo === "publike";
  const mostradas = vagas.slice(0, 6);
  const resto = vagas.length - mostradas.length;
  const quantas = vagas.length
    ? plural(vagas.length, publike ? "vaga" : "vaga aberta", publike ? "vagas" : "vagas abertas")
    : "";
  return imagem(
    <div style={fundo("210px 72px 150px", a)}>
      <Topo
        logo={await logoDa(a)}
        a={a}
        altura={publike ? 70 : 56}
        direita={<Pilula texto={publike ? (texto?.selo ?? "HOJE") : "VAGAS ABERTAS"} fonte={32} cor="ipe" />}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage",
            fontSize: publike ? tamanhoDoTitulo(titulo, 132) : 128,
            lineHeight: 0.95,
            letterSpacing: -4,
          }}
        >
          {publike ? titulo : "Estamos contratando"}
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 60, color: destaque(a), lineHeight: 1.1 }}>
          {publike ? (quantas ? `${quantas} em ${onde}` : `em ${onde}`) : quantas}
        </div>
        <div style={{ display: "flex", fontSize: 40, color: COR.apagado }}>{maiuscula(texto?.quando ?? dia)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {mostradas.map((v) => (
          <div
            key={v.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: COR.cartao,
              border: `3px solid ${COR.borda}`,
              borderRadius: 30,
              padding: "22px 32px",
            }}
          >
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, lineHeight: 1.15 }}>{curto(v.titulo, 34)}</div>
            <div style={{ display: "flex", fontSize: 33, color: COR.apagado }}>
              {curto(`${valorCurto(v.pagamento_valor, v.pagamento_unidade)} · ${lugar(v)}`, 50)}
            </div>
          </div>
        ))}
        {resto > 0 && (
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: destaque(a), paddingLeft: 8 }}>
            {`e mais ${plural(resto, "vaga", "vagas")}`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: destaque(a) }}>Toque para ver cada uma</div>
        <img src={paraOLado(destaque(a))} alt="" width={60} height={60} />
      </div>
    </div>,
    STORY,
    arquivo,
  );
}

/**
 * O último story (1080 × 1920): "Mais vagas perto de você" (Publike) ou "Veja todas as nossas vagas" (empresa), os
 * três passos e, embaixo, o lugar do adesivo de link (o link da bio: todas as vagas).
 */
export async function storyFimDoDia(a: Assinatura = DO_PUBLIKE, arquivo: string | null = null) {
  const publike = a.tipo === "publike";
  const cheia = corCheia(a);
  return imagem(
    <div style={fundo("210px 72px 110px", a)}>
      <Topo logo={await logoDa(a)} a={a} altura={publike ? 70 : 56} direita={null} />
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 132, lineHeight: 0.95, letterSpacing: -3 }}>
          {publike ? "Mais vagas perto de você" : "Veja todas as nossas vagas"}
        </div>
        {PASSOS.map((p, i) => (
          <div key={p.titulo} style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 88,
                height: 88,
                borderRadius: 999,
                background: cheia,
                color: textoSobre(cheia),
                fontFamily: "Bricolage",
                fontSize: 50,
                flexShrink: 0,
              }}
            >
              {String(i + 1)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>
                {i === 0 ? "Toque no link abaixo" : p.titulo}
              </div>
              <div style={{ display: "flex", fontSize: 34, color: COR.apagado }}>
                {i === 2 && !publike ? "Recebemos na hora e respondemos por lá." : p.texto}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: COR.like }}>
          Nunca pague para conseguir trabalho.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, minHeight: 360 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: destaque(a) }}>
          {publike ? "Toque no link e veja todas" : "Toque no link"}
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
 * último), os stories (stories/: a capa, um por vaga e o "mais vagas"), a legenda e os links dos adesivos, num .zip.
 */
export async function pacoteDoDia(
  vagas: VagaDoDia[],
  dia: string,
  a: Assinatura,
  textos: { legenda: string; bio: string; linkDoStory: (id: string) => string; fimDosStories?: string },
  quando: Date,
  /** o título, onde e quando das capas (Admin › Vagas do dia) */
  capa?: TextoDaCapa,
  /** 3: os stories com três vagas cada (a pilha da inicial), em vez de um por vaga */
  porStory: 1 | 3 = 1,
  /** o "1/4" no selo dos stories de três vagas (opcional) */
  numero = true,
) {
  const total = vagas.length;
  // uma imagem por vez: o desenho usa o processador, e em paralelo não fica mais rápido
  const png = async (pedido: Promise<Response>) => new Uint8Array(await (await pedido).arrayBuffer());
  const arquivos: ArquivoDoZip[] = [{ nome: "carrossel/01-capa.png", dados: await png(capaDoDia(vagas, dia, a, null, capa)) }];
  for (const [i, v] of vagas.entries()) {
    arquivos.push({
      nome: `carrossel/${doisDigitos(i + 2)}-${nomeDeArquivo(v.titulo)}.png`,
      dados: await png(vagaDoDia(v, i + 1, total, a)),
    });
  }
  arquivos.push({ nome: `carrossel/${doisDigitos(total + 2)}-como-se-candidatar.png`, dados: await png(fimDoDia(a)) });
  // os stories: a capa (00), um por vaga e o fim, com o link da bio
  arquivos.push({ nome: "stories/00-capa.png", dados: await png(storyCapaDoDia(vagas, dia, a, null, capa)) });
  const trios = porStory === 3 ? emTrios(vagas) : [];
  if (trios.length) {
    for (const [i, trio] of trios.entries()) {
      arquivos.push({
        nome: `stories/${doisDigitos(i + 1)}-tres-vagas.png`,
        dados: await png(storyTrioDoDia(trio, i + 1, trios.length, a, null, capa, numero)),
      });
    }
  } else {
    for (const [i, v] of vagas.entries()) {
      arquivos.push({ nome: `stories/${doisDigitos(i + 1)}-${nomeDeArquivo(v.titulo)}.png`, dados: await png(storyDoDia(v, a)) });
    }
  }
  const ultimo = trios.length ? trios.length + 1 : total + 1;
  arquivos.push({ nome: `stories/${doisDigitos(ultimo)}-mais-vagas.png`, dados: await png(storyFimDoDia(a)) });
  const texto = new TextEncoder();
  arquivos.push({ nome: "legenda.txt", dados: texto.encode(`${textos.legenda}\n`) });
  arquivos.push({
    nome: "links-dos-stories.txt",
    dados: texto.encode(
      trios.length
        ? textoDosLinksDosTrios(trios, textos.fimDosStories ?? textos.bio, textos.bio)
        : textoDosLinks(vagas, textos.linkDoStory, textos.bio, textos.fimDosStories),
    ),
  });
  return montarZip(arquivos, quando);
}


const BANNER = { width: 1600, height: 900 };

/** O tamanho das letras e da logo de cada cartão do banner, por quantas vagas vão nele. */
const MEDIDAS_DO_BANNER = {
  1: { largura: 1120, logo: 150, titulo: 92, maxTitulo: 44, linha: 40, maxLinha: 58, valor: 44, gap: 40, padding: "48px 56px" },
  2: { largura: 660, logo: 112, titulo: 62, maxTitulo: 38, linha: 32, maxLinha: 38, valor: 36, gap: 26, padding: "40px 40px" },
  3: { largura: 452, logo: 96, titulo: 48, maxTitulo: 34, linha: 28, maxLinha: 30, valor: 32, gap: 22, padding: "34px 30px" },
} as const;

/**
 * A imagem de um banner com 1, 2 ou 3 vagas (claude/plano-banner-com-vagas.md), em 1600 × 900: os cartões como a
 * pilha da inicial do site, levemente girados. Com uma vaga, um cartão grande deitado; com duas ou três, lado a lado.
 * O conteúdo fica no meio, longe das bordas de cima e de baixo (o destaque corta a imagem com 144 px de altura).
 */
export async function bannerDeVagas(vagas: VagaDoDia[], arquivo: string | null = null) {
  const lista = vagas.slice(0, 3);
  const quantas = Math.max(1, lista.length) as 1 | 2 | 3;
  const m = MEDIDAS_DO_BANNER[quantas];
  const uma = quantas === 1;
  const logo = await lerLogo();
  return imagem(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
        width: "100%",
        height: "100%",
        padding: "0 72px",
        background: COR.fundo,
        color: COR.tinta,
        fontFamily: "Figtree",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <img src={logo} alt="" width={larguraDaLogo(52)} height={52} />
        <Pilula texto={uma ? "VAGA ABERTA" : "VAGAS ABERTAS"} fonte={28} cor="ipe" />
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "stretch", gap: 36, width: "100%" }}>
        {lista.map((v, i) => {
          const { grande, embaixo } = valor(v);
          const linha = v.quem ? `${v.quem} · ${lugar(v)}` : lugar(v);
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                flexDirection: uma ? "row" : "column",
                alignItems: uma ? "center" : "flex-start",
                gap: m.gap,
                width: m.largura,
                background: COR.cartao,
                border: `3px solid ${COR.borda}`,
                borderRadius: 40,
                padding: m.padding,
                boxShadow: "0 18px 40px rgba(31, 26, 20, 0.12)",
                transform: `rotate(${GIROS_DO_TRIO[i]}deg)`,
              }}
            >
              <LogoDaVaga v={v} tamanho={m.logo} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 0,
                  ...(uma ? { flex: 1 } : { width: "100%" }),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Bricolage",
                    fontSize: uma ? tamanhoDoTitulo(v.titulo, m.titulo) : m.titulo,
                    lineHeight: 1.04,
                    letterSpacing: uma ? -2 : -1,
                  }}
                >
                  {curto(v.titulo, m.maxTitulo)}
                </div>
                {uma ? (
                  <div style={{ display: "flex", fontSize: m.linha, color: COR.apagado, lineHeight: 1.2 }}>
                    {curto(linha, m.maxLinha)}
                  </div>
                ) : (
                  // lado a lado, quem contrata e o lugar em duas linhas (numa só, o bairro era cortado)
                  <div style={{ display: "flex", flexDirection: "column", fontSize: m.linha, color: COR.apagado, lineHeight: 1.25 }}>
                    {v.quem && <div style={{ display: "flex" }}>{curto(v.quem, m.maxLinha)}</div>}
                    <div style={{ display: "flex" }}>{curto(lugar(v), m.maxLinha)}</div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "flex",
                      background: COR.selo,
                      color: COR.cerrado,
                      borderRadius: 999,
                      padding: `6px ${Math.round(m.valor * 0.6)}px`,
                      fontSize: m.valor,
                      fontWeight: 700,
                    }}
                  >
                    {curto(grande, 26)}
                  </div>
                  {uma && embaixo && (
                    <div style={{ display: "flex", fontSize: Math.round(m.valor * 0.75), color: COR.apagado }}>
                      {embaixo}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    BANNER,
    arquivo,
  );
}
