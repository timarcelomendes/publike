import "server-only";
import { ImageResponse } from "next/og";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { tempoDoTrabalho, type CurriculoMontado } from "@/lib/curriculo-pelo-whatsapp";
import { lerFontes } from "./kit-imagens";

// O cartão em imagem e o PDF de uma página do currículo montado no WhatsApp (migração 20270903120000;
// claude/plano-curriculo-otimizado.md, fase 1). O cartão (1080×1350, o formato do feed e do status) é para mandar nos
// grupos de vagas: sem telefone (quem vê no grupo já sabe quem mandou). O PDF é para imprimir e entregar: com o nome e
// o número do WhatsApp. As letras e as cores são as do site.

const COR = {
  fundo: "#fbf7ef",
  cartao: "#ffffff",
  borda: "#ece3d4",
  tinta: "#1f1a14",
  apagado: "#5c5246",
  terra: "#a2441f",
  selo: "#f2ebdf",
};

const curto = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

/** O resumo sem repetir o título logo embaixo dele ("Auxiliar de cozinha · cerca de 2 anos..." vira "Cerca de 2 anos..."). */
export function resumoSemTitulo(c: CurriculoMontado) {
  const partes = c.resumo.split(" · ");
  if (partes.length > 1 && c.titulo && partes[0].trim().toLowerCase() === c.titulo.trim().toLowerCase()) partes.shift();
  const r = partes.join(" · ").trim();
  return r ? r[0].toUpperCase() + r.slice(1) : "";
}

function estudoDe(c: CurriculoMontado) {
  return [c.escolaridade ? nomeEscolaridade(c.escolaridade) : "", c.curso].filter(Boolean).join(": ");
}
function horariosDe(c: CurriculoMontado) {
  return c.disponibilidade.map((d) => nomeDisponibilidade(d).replace(/ \(.*\)$/, "").toLowerCase()).join(", ");
}

/** O cartão para os grupos e o status (PNG 1080×1350). */
export async function cartaoDoCurriculo(c: CurriculoMontado, nome: string, hoje: string) {
  const experiencias = c.experiencias.slice(0, 3);
  const estudo = estudoDe(c);
  const habilidades = c.habilidades.slice(0, 6);
  const titulo = curto(c.titulo || experiencias[0]?.cargo || "Procuro trabalho", 48);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COR.fundo,
        padding: 72,
        color: COR.tinta,
        fontFamily: "Figtree",
        borderTop: `18px solid ${COR.terra}`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: COR.terra }}>Currículo</div>
        {nome && (
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: nome.length > 22 ? 64 : 80, lineHeight: 1.02 }}>
            {curto(nome, 40)}
          </div>
        )}
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: nome ? 52 : 80, lineHeight: 1.05, color: nome ? COR.terra : COR.tinta }}>
          {titulo}
        </div>
        {resumoSemTitulo(c) && (
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, color: COR.apagado }}>{curto(resumoSemTitulo(c), 170)}</div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 22,
          background: COR.cartao,
          border: `2px solid ${COR.borda}`,
          borderRadius: 28,
          padding: "36px 40px",
        }}
      >
        {experiencias.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: COR.terra }}>Experiência</div>
            {experiencias.map((x, i) => {
              const tempo = tempoDoTrabalho(x, hoje);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>{curto(x.cargo, 40)}</div>
                  <div style={{ display: "flex", fontSize: 30, color: COR.apagado }}>
                    {curto([x.onde, tempo].filter(Boolean).join(" · "), 56)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(estudo || c.cursos.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: COR.terra }}>Estudo</div>
            {estudo && <div style={{ display: "flex", fontSize: 32 }}>{curto(estudo, 60)}</div>}
            {c.cursos.length > 0 && (
              <div style={{ display: "flex", fontSize: 30, color: COR.apagado }}>{curto(c.cursos.join(", "), 80)}</div>
            )}
          </div>
        )}
        {habilidades.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {habilidades.map((h) => (
              <div
                key={h}
                style={{ display: "flex", fontSize: 28, fontWeight: 700, background: COR.selo, borderRadius: 999, padding: "8px 22px" }}
              >
                {curto(h, 30)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>Fale comigo pelo WhatsApp</div>
          {(c.cnh || c.disponibilidade.length > 0) && (
            <div style={{ display: "flex", fontSize: 28, color: COR.apagado }}>
              {[c.disponibilidade.length ? `Posso: ${horariosDe(c)}` : "", c.cnh ? `CNH ${c.cnh}` : ""].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: COR.apagado }}>Feito no Publike</div>
      </div>
    </div>,
    {
      width: 1080,
      height: 1350,
      fonts: await lerFontes(),
      headers: { "cache-control": "private, max-age=300" },
    },
  );
}

// --- O PDF ------------------------------------------------------------------------------------------------------------

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (aaaaMm: string) => {
  const [a, m] = aaaaMm.split("-").map(Number);
  return a && m ? `${MESES[m - 1]}/${a}` : "";
};

/** "jan/2024 a dez/2025 (2 anos)", "desde jun/2025 (1 ano e meio)", "" sem datas. */
export function periodoDoTrabalho(x: { inicio: string; fim: string; atual: boolean }, hoje: string) {
  if (!mesAno(x.inicio)) return x.atual ? "Trabalho atual" : "";
  const tempo = tempoDoTrabalho({ ...x, atual: false, fim: x.atual ? "" : x.fim }, hoje);
  const quando = x.atual || !x.fim ? `desde ${mesAno(x.inicio)}` : `${mesAno(x.inicio)} a ${mesAno(x.fim)}`;
  return tempo ? `${quando} (${tempo})` : quando;
}

/** "(62) 99999-0000" do número com o 55. */
export function telefoneVisivel(numero: string | null) {
  const d = (numero ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d ? `+${(numero ?? "").replace(/\D/g, "")}` : "";
}

/** O que a Helvetica do PDF escreve (WinAnsi): sem emoji nem letra de fora. */
const paraPdf = (t: string) =>
  t
    .replace(/[‐-‒]/g, "-")
    .replace(/[^ -~ -ÿ–—‘’“”•…]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  const linhas: string[] = [];
  let linha = "";
  for (const palavra of paraPdf(texto).split(" ")) {
    const tentativa = linha ? `${linha} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !linha) linha = tentativa;
    else {
      linhas.push(linha);
      linha = palavra;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

/** O PDF de uma página (A4), para imprimir. O que não couber fica de fora (as experiências mais antigas primeiro). */
export async function pdfDoCurriculo(c: CurriculoMontado, nome: string, telefone: string | null, hoje: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(paraPdf(`Currículo${nome ? ` de ${nome}` : ""}`));
  pdf.setCreator("Publike");
  pdf.setProducer("Publike");
  const pagina: PDFPage = pdf.addPage([595.28, 841.89]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const forte = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0.12, 0.1, 0.08);
  const apagado = rgb(0.36, 0.32, 0.27);
  const terra = rgb(0.635, 0.267, 0.122);
  const margem = 56;
  const largura = 595.28 - margem * 2;
  const fim = 70;
  let y = 841.89 - margem;
  let coube = true;

  const escrever = (texto: string, o: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb>; antes?: number; entre?: number } = {}) => {
    const fonte = o.fonte ?? normal;
    const tamanho = o.tamanho ?? 10.5;
    y -= o.antes ?? 0;
    for (const l of quebrar(texto, fonte, tamanho, largura)) {
      if (y - tamanho < fim) {
        coube = false;
        return;
      }
      y -= tamanho * (o.entre ?? 1.35);
      pagina.drawText(l, { x: margem, y, size: tamanho, font: fonte, color: o.cor ?? tinta });
    }
  };
  const secao = (titulo: string) => {
    escrever(titulo, { fonte: forte, tamanho: 11.5, cor: terra, antes: 14 });
    if (!coube) return;
    y -= 4;
    pagina.drawLine({ start: { x: margem, y }, end: { x: margem + largura, y }, thickness: 0.6, color: rgb(0.9, 0.86, 0.8) });
    y -= 2;
  };

  if (nome) escrever(nome, { fonte: forte, tamanho: 22 });
  if (c.titulo) escrever(c.titulo, { fonte: forte, tamanho: 13, cor: terra, antes: nome ? 4 : 0 });
  const contato = [telefoneVisivel(telefone) && `WhatsApp: ${telefoneVisivel(telefone)}`, c.cnh && `CNH ${c.cnh}`]
    .filter(Boolean)
    .join("   ·   ");
  if (contato) escrever(contato, { cor: apagado, antes: 4 });
  if (resumoSemTitulo(c)) escrever(resumoSemTitulo(c), { tamanho: 11, antes: 10 });

  if (c.experiencias.length) {
    secao("Experiência");
    for (const x of c.experiencias) {
      if (!coube) break;
      escrever(`${x.cargo}${x.onde ? ` – ${x.onde}` : ""}`, { fonte: forte, tamanho: 11, antes: 6 });
      const periodo = periodoDoTrabalho(x, hoje);
      if (periodo) escrever(periodo, { cor: apagado, tamanho: 9.5 });
      if (x.descricao) escrever(x.descricao, { antes: 1 });
    }
  }
  const estudo = estudoDe(c);
  if (estudo || c.estudos.length || c.cursos.length) {
    secao("Estudo e cursos");
    if (estudo) escrever(estudo, { antes: 4 });
    for (const e of c.estudos) escrever(`${nomeEscolaridade(e.nivel)}${e.curso ? `: ${e.curso}` : ""}`);
    if (c.cursos.length) escrever(`Cursos: ${c.cursos.join(", ")}`);
  }
  if (c.habilidades.length) {
    secao("O que sei fazer");
    escrever(c.habilidades.join(" · "), { antes: 4 });
  }
  if (c.disponibilidade.length) {
    secao("Disponibilidade");
    escrever(`Posso trabalhar: ${horariosDe(c)}`, { antes: 4 });
  }
  pagina.drawText(paraPdf("Currículo feito no Publike · publike.org"), {
    x: margem,
    y: 40,
    size: 8.5,
    font: normal,
    color: apagado,
  });
  return pdf.save();
}
