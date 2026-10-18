import type { ReactNode } from "react";
import type { Conteudo, TemaConteudo } from "@/lib/conteudos/tipos";

// Capas desenhadas (sem foto): uma cena por tema, nas cores do Publike, com
// pequenas variações por artigo, e o número principal do artigo em destaque.
// As cores vêm dos tokens, então a capa acompanha o tema claro e o escuro.

const COR: Record<TemaConteudo, string> = {
  mercado: "var(--pk-terra)",
  procurar: "var(--pk-cerrado)",
  contratar: "var(--pk-ipe)",
  servicos: "var(--pk-terra)",
  direitos: "var(--pk-cerrado)",
};

const CORES_EXTRA = ["var(--pk-terra)", "var(--pk-cerrado)", "var(--pk-ipe)"];

const mistura = (cor: string, pct: number, base = "var(--pk-surface-200)") =>
  `color-mix(in oklab, ${cor} ${pct}%, ${base})`;

/** Um número de 0 a 1 que muda de artigo para artigo (sempre o mesmo para o mesmo artigo). */
function sorteio(slug: string) {
  let h = 2166136261;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (i: number) => {
    const x = Math.sin((h >>> 0) * 0.0001 + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
}

const INK = "var(--pk-ink)";
const FUNDO = "var(--pk-surface-200)";

function Mercado({ r, cor }: { r: (i: number) => number; cor: string }) {
  const predios = Array.from({ length: 9 }, (_, i) => ({ x: 20 + i * 70, h: 90 + r(i) * 120, w: 50 + r(i + 20) * 18 }));
  const barras = Array.from({ length: 6 }, (_, i) => 70 + i * 34 + r(i + 40) * 20);
  return (
    <>
      {predios.map((p, i) => (
        <g key={i} opacity={0.18 + (i % 3) * 0.06}>
          <rect x={p.x} y={300 - p.h} width={p.w} height={p.h} rx={4} fill={INK} />
        </g>
      ))}
      {barras.map((h, i) => (
        <rect key={i} x={150 + i * 62} y={300 - h} width={40} height={h} rx={8} fill={cor} opacity={0.55 + i * 0.08} />
      ))}
      <path
        d={`M150 ${290 - barras[0]} ${barras.map((h, i) => `L${170 + i * 62} ${282 - h}`).join(" ")}`}
        fill="none"
        stroke={INK}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`M${470} ${282 - barras[5] - 4} l-6 22 l24 -10 z`} fill={INK} />
    </>
  );
}

function Procurar({ r, cor }: { r: (i: number) => number; cor: string }) {
  const pinos = Array.from({ length: 5 }, (_, i) => ({ x: 120 + r(i) * 340, y: 130 + r(i + 9) * 110 }));
  const casa = { x: 80 + r(30) * 60, y: 250 };
  const alvo = pinos[0];
  return (
    <>
      {[90, 170, 250].map((y) => (
        <rect key={y} x={0} y={y} width={640} height={14} fill={FUNDO} opacity={0.7} />
      ))}
      {[140, 300, 460].map((x) => (
        <rect key={x} x={x} y={40} width={14} height={300} fill={FUNDO} opacity={0.7} />
      ))}
      <path d="M0 320 C160 280 260 340 400 300 S600 260 640 280 L640 360 L0 360 Z" fill={cor} opacity={0.25} />
      <path
        d={`M${casa.x + 20} ${casa.y} C${casa.x + 80} ${casa.y - 80} ${alvo.x - 60} ${alvo.y + 90} ${alvo.x} ${alvo.y + 30}`}
        fill="none"
        stroke={INK}
        strokeWidth={5}
        strokeDasharray="4 12"
        strokeLinecap="round"
      />
      <g transform={`translate(${casa.x} ${casa.y - 36})`}>
        <path d="M0 22 L22 0 L44 22 V48 H0 Z" fill={INK} />
        <rect x={16} y={30} width={12} height={18} fill={FUNDO} />
      </g>
      {pinos.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) scale(${i === 0 ? 1.5 : 0.9})`} opacity={i === 0 ? 1 : 0.55}>
          <path d="M0 -28 C-16 -28 -24 -16 -24 -4 C-24 12 0 30 0 30 C0 30 24 12 24 -4 C24 -16 16 -28 0 -28 Z" fill={i === 0 ? cor : INK} />
          <circle cx={0} cy={-6} r={8} fill={FUNDO} />
        </g>
      ))}
    </>
  );
}

function Contratar({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 150 + r(1) * 60;
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      <rect x={x} y={110} width={330} height={190} rx={6} fill={FUNDO} />
      <rect x={x} y={110} width={330} height={190} rx={6} fill="none" stroke={INK} strokeWidth={5} />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M${x - 10 + i * 58} 110 h58 v26 a29 18 0 0 1 -58 0 z`}
          fill={i % 2 ? FUNDO : "var(--pk-terra)"}
          stroke={INK}
          strokeWidth={4}
        />
      ))}
      <rect x={x + 30} y={170} width={120} height={80} rx={4} fill={mistura(cor, 30)} stroke={INK} strokeWidth={4} />
      <rect x={x + 200} y={170} width={90} height={130} rx={4} fill={mistura(INK, 12)} stroke={INK} strokeWidth={4} />
      <g transform={`translate(${x + 40} 186) rotate(-6)`}>
        <rect width={100} height={46} rx={8} fill={cor} stroke={INK} strokeWidth={4} />
        <rect x={22} y={16} width={56} height={6} rx={3} fill={INK} />
        <rect x={30} y={28} width={40} height={6} rx={3} fill={INK} />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${60 + i * 40 + r(i + 5) * 10} 300)`} opacity={0.8 - i * 0.2}>
          <circle cx={0} cy={-62} r={14} fill={INK} />
          <path d="M-20 0 C-20 -30 -14 -42 0 -42 C14 -42 20 -30 20 0 Z" fill={INK} />
        </g>
      ))}
    </>
  );
}

function Servicos({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 330 + r(2) * 60;
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      <path d={`M${x} 160 L${x + 110} 80 L${x + 220} 160 V300 H${x} Z`} fill={FUNDO} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <rect x={x + 85} y={210} width={50} height={90} rx={4} fill={cor} stroke={INK} strokeWidth={4} />
      <rect x={x + 25} y={185} width={44} height={40} rx={4} fill={mistura(cor, 30)} stroke={INK} strokeWidth={4} />
      {/* escada */}
      <g stroke={INK} strokeWidth={6} strokeLinecap="round">
        <line x1={x - 40} y1={300} x2={x + 20} y2={130} />
        <line x1={x - 5} y1={300} x2={x + 52} y2={140} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={x - 30 + i * 13} y1={270 - i * 38} x2={x + 2 + i * 13} y2={276 - i * 38} />
        ))}
      </g>
      {/* rolo de pintura e chave */}
      <g transform={`translate(${110 + r(3) * 40} 180) rotate(-20)`}>
        <rect x={-50} y={-22} width={100} height={44} rx={14} fill={cor} stroke={INK} strokeWidth={5} />
        <path d="M0 22 V60 H-8 V120" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      </g>
      <g transform={`translate(${200 + r(4) * 30} 250) rotate(35)`} fill={INK}>
        <rect x={-6} y={-10} width={12} height={80} rx={6} />
        <path d="M-22 -30 a22 22 0 1 0 44 0 l-10 0 l0 12 l-24 0 l0 -12 z" />
      </g>
    </>
  );
}

function Direitos({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 120 + r(1) * 40;
  return (
    <>
      <g transform={`translate(${x} 70) rotate(-5)`}>
        <rect width={230} height={250} rx={14} fill={mistura(INK, 85)} />
        <rect x={20} y={24} width={110} height={14} rx={7} fill={FUNDO} opacity={0.9} />
        <rect x={20} y={50} width={70} height={10} rx={5} fill={FUNDO} opacity={0.5} />
        <rect x={20} y={190} width={190} height={10} rx={5} fill={FUNDO} opacity={0.35} />
        <rect x={20} y={210} width={140} height={10} rx={5} fill={FUNDO} opacity={0.35} />
        <circle cx={115} cy={125} r={38} fill={FUNDO} opacity={0.18} />
      </g>
      <g transform={`translate(${x + 270} 110)`}>
        <path d="M70 0 L140 26 V96 C140 150 104 182 70 196 C36 182 0 150 0 96 V26 Z" fill={cor} stroke={INK} strokeWidth={5} />
        <path d="M38 98 L62 122 L106 76" fill="none" stroke={FUNDO} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={x + 440 + r(8) * 20} cy={300 - i * 16} rx={34} ry={11} fill="var(--pk-ipe)" stroke={INK} strokeWidth={4} />
      ))}
    </>
  );
}


function Fabrica({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 90 + r(1) * 40;
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      <path d={`M${x} 300 V170 L${x + 90} 210 V170 L${x + 180} 210 V170 L${x + 270} 210 V300 Z`} fill={FUNDO} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <rect x={x + 290} y={90} width={34} height={210} fill={INK} />
      <rect x={x + 340} y={130} width={30} height={170} fill={INK} opacity={0.8} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + 310 + i * 26 + r(i) * 10} cy={70 - i * 22} r={16 + i * 6} fill={INK} opacity={0.12 + i * 0.04} />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x + 25 + i * 80} y={235} width={44} height={34} rx={4} fill={cor} stroke={INK} strokeWidth={4} />
      ))}
      <g transform={`translate(${x + 410} 250)`}>
        <circle r={34} fill="none" stroke={INK} strokeWidth={10} strokeDasharray="12 9" />
        <circle r={14} fill={cor} stroke={INK} strokeWidth={4} />
      </g>
    </>
  );
}

function Obra({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 60 + r(1) * 40;
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      <g stroke={INK} strokeWidth={6} strokeLinecap="round">
        <line x1={x + 60} y1={300} x2={x + 60} y2={60} />
        <line x1={x + 20} y1={70} x2={x + 330} y2={70} />
        <line x1={x + 60} y1={70} x2={x + 110} y2={110} />
        <line x1={x + 280} y1={70} x2={x + 280} y2={150} />
      </g>
      <rect x={x + 255} y={150} width={50} height={30} rx={4} fill={cor} stroke={INK} strokeWidth={4} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) =>
          row * 4 + col < 12 + Math.floor(r(2) * 4) ? (
            <rect key={`${row}-${col}`} x={x + 160 + col * 56 + (row % 2) * 28} y={276 - row * 26} width={52} height={22} rx={3} fill={(row + col) % 3 ? "var(--pk-terra)" : cor} stroke={INK} strokeWidth={3} />
          ) : null,
        ),
      )}
      <path d={`M${x + 450} 300 l30 -60 l30 60 z`} fill="var(--pk-ipe)" stroke={INK} strokeWidth={4} />
    </>
  );
}

function Onibus({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 140 + r(1) * 60;
  return (
    <>
      <rect x={0} y={290} width={640} height={70} fill={INK} opacity={0.14} />
      <rect x={0} y={318} width={640} height={6} fill={FUNDO} opacity={0.8} strokeDasharray="20 20" />
      <rect x={x} y={150} width={300} height={130} rx={22} fill={cor} stroke={INK} strokeWidth={5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={x + 22 + i * 64} y={172} width={50} height={44} rx={6} fill={FUNDO} stroke={INK} strokeWidth={4} />
      ))}
      <rect x={x + 270} y={172} width={20} height={80} rx={4} fill={FUNDO} stroke={INK} strokeWidth={4} />
      {[60, 230].map((dx) => (
        <circle key={dx} cx={x + dx} cy={282} r={22} fill={INK} />
      ))}
      <g transform={`translate(${x - 90} 170)`}>
        <rect x={-4} y={0} width={8} height={120} fill={INK} />
        <rect x={-30} y={0} width={60} height={34} rx={6} fill="var(--pk-ipe)" stroke={INK} strokeWidth={4} />
      </g>
    </>
  );
}

function Documento({ r, cor }: { r: (i: number) => number; cor: string }) {
  const x = 170 + r(1) * 40;
  return (
    <>
      <g transform={`translate(${x} 50) rotate(${-4 + r(2) * 8})`}>
        <rect width={240} height={290} rx={12} fill={FUNDO} stroke={INK} strokeWidth={5} />
        <circle cx={60} cy={70} r={30} fill={cor} stroke={INK} strokeWidth={4} />
        <rect x={110} y={50} width={100} height={12} rx={6} fill={INK} />
        <rect x={110} y={76} width={70} height={10} rx={5} fill={INK} opacity={0.4} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={30} y={130 + i * 28} width={i % 2 ? 140 : 180} height={10} rx={5} fill={INK} opacity={0.3} />
        ))}
      </g>
      <g transform={`translate(${x + 230} 210)`}>
        <circle r={52} fill={mistura(cor, 25)} stroke={INK} strokeWidth={10} />
        <line x1={38} y1={38} x2={90} y2={90} stroke={INK} strokeWidth={16} strokeLinecap="round" />
      </g>
    </>
  );
}

function Pessoas({ r, cor }: { r: (i: number) => number; cor: string }) {
  const cores = [cor, "var(--pk-terra)", "var(--pk-ipe)", "var(--pk-cerrado)", INK];
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 110 + i * 105 + r(i) * 10;
        const h = 150 + r(i + 10) * 40;
        return (
          <g key={i} transform={`translate(${x} 300)`}>
            <circle cx={0} cy={-h - 30} r={30} fill={INK} />
            <path d={`M-45 0 C-45 ${-h * 0.8} -30 ${-h} 0 ${-h} C30 ${-h} 45 ${-h * 0.8} 45 0 Z`} fill={cores[(i + Math.floor(r(30) * 5)) % 5]} stroke={INK} strokeWidth={4} />
          </g>
        );
      })}
    </>
  );
}

function Moedas({ r, cor }: { r: (i: number) => number; cor: string }) {
  const pilhas = [5, 8, 11, 14].map((n, i) => n + Math.floor(r(i) * 3));
  return (
    <>
      <rect x={0} y={300} width={640} height={60} fill={INK} opacity={0.12} />
      {pilhas.map((n, i) => (
        <g key={i}>
          {Array.from({ length: n }, (_, j) => (
            <ellipse key={j} cx={150 + i * 110} cy={292 - j * 15} rx={42} ry={13} fill="var(--pk-ipe)" stroke={INK} strokeWidth={4} />
          ))}
        </g>
      ))}
      <rect x={470} y={130} width={120} height={70} rx={10} fill={cor} stroke={INK} strokeWidth={5} transform="rotate(-10 530 165)" />
      <circle cx={530} cy={165} r={18} fill={FUNDO} stroke={INK} strokeWidth={4} transform="rotate(-10 530 165)" />
    </>
  );
}

const CENAS_TEMA: Record<TemaConteudo, (p: { r: (i: number) => number; cor: string }) => ReactNode> = {
  mercado: Mercado,
  procurar: Procurar,
  contratar: Contratar,
  servicos: Servicos,
  direitos: Direitos,
};

type Cena = (p: { r: (i: number) => number; cor: string }) => ReactNode;

/** Cena própria para alguns artigos, para a lista não ficar repetida. */
const CENA_DO_ARTIGO: Record<string, Cena> = {
  "industria-goiana-empregos": Fabrica,
  "construcao-civil-vagas-goiania": Obra,
  "aparecida-de-goiania-empregos": Pessoas,
  "regiao-metropolitana-goiania-empregos": Onibus,
  "senador-canedo-goianira-trindade": Procurar,
  "informalidade-goias": Pessoas,
  "salario-de-admissao-2026": Moedas,
  "emprego-perto-de-casa-goiania": Onibus,
  "primeiro-emprego-jovens-goiania": Pessoas,
  "jovem-aprendiz-goiania": Documento,
  "curriculo-simples-que-funciona": Documento,
  "entrevista-de-emprego-dicas": Pessoas,
  "golpe-de-emprego-como-evitar": Direitos,
  "emprego-para-mulheres-goiania": Pessoas,
  "cursos-gratuitos-qualificacao-goias": Documento,
  "contratar-perto-de-casa": Onibus,
  "contratar-jovem-aprendiz": Pessoas,
  "diarista-pedreiro-eletricista-goiania": Servicos,
  "mei-goiania-como-formalizar": Documento,
  "renda-extra-bicos-goiania": Moedas,
  "carteira-assinada-direitos": Documento,
  "seguro-desemprego-passo-a-passo": Moedas,
};

/** O número em destaque do artigo (o primeiro bloco de número). */
export function numeroDoConteudo(c: Conteudo) {
  const b = c.blocos.find((x) => x.t === "numero");
  return b && b.t === "numero" ? b.valor : null;
}

/**
 * O que o número é, curto, para ir junto dele na capa ("1.511.709" sozinho não diz nada):
 * o rótulo até a primeira vírgula ("moradores em Goiânia, pela estimativa do IBGE" → "moradores em Goiânia").
 */
export function rotuloDoNumero(c: Conteudo) {
  const b = c.blocos.find((x) => x.t === "numero");
  return b && b.t === "numero" ? b.rotulo.split(",")[0].trim() : null;
}

/** As cenas, para outras capas desenhadas (as das notícias). */
export const CENAS = { Mercado, Procurar, Contratar, Servicos, Direitos, Fabrica, Obra, Onibus, Documento, Pessoas, Moedas };
export type NomeCena = keyof typeof CENAS;
export const CORES_CAPA = { terra: "var(--pk-terra)", cerrado: "var(--pk-cerrado)", ipe: "var(--pk-ipe)" } as const;

/** Capa desenhada genérica: uma cena, uma cor, um número em destaque (opcional). */
export function CapaDesenhada({
  semente,
  cena,
  cor,
  numero,
  tamanho = "card",
  className = "",
}: {
  semente: string;
  cena: NomeCena;
  cor: keyof typeof CORES_CAPA;
  numero?: string | null;
  tamanho?: "card" | "grande";
  className?: string;
}) {
  const r = sorteio(semente);
  const Cena = CENAS[cena];
  const corCss = CORES_CAPA[cor];
  const esquerda = cena === "Mercado" || cena === "Fabrica" || cena === "Moedas" || cena === "Obra";
  const sol = { x: esquerda ? 60 + r(50) * 60 : 520 + r(50) * 70, y: 55 + r(51) * 20 };
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: mistura(corCss, 22) }}>
      <svg
        viewBox="0 0 640 360"
        role="presentation"
        aria-hidden
        className="block h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle cx={sol.x} cy={sol.y} r={46} fill="var(--pk-ipe)" opacity={0.9} />
        <Cena r={r} cor={corCss} />
      </svg>
      {numero && (
        <span
          className={`absolute bottom-3 left-3 rounded-md bg-surface-200/95 px-2.5 py-1 font-display text-ink shadow-card ${
            tamanho === "grande" ? "text-h2 sm:bottom-5 sm:left-5 sm:px-4 sm:py-2 sm:text-h1" : "text-h3"
          }`}
        >
          {numero}
        </span>
      )}
    </div>
  );
}

/** A capa do artigo: cena do tema e, se houver, o número principal. */
export function CapaConteudo({
  c,
  tamanho = "card",
  className = "",
}: {
  c: Conteudo;
  tamanho?: "card" | "grande";
  className?: string;
}) {
  const r = sorteio(c.slug);
  const cor = r(99) < 0.35 ? CORES_EXTRA[Math.floor(r(98) * CORES_EXTRA.length)] : COR[c.tema];
  const Cena = CENA_DO_ARTIGO[c.slug] ?? CENAS_TEMA[c.tema];
  const numero = numeroDoConteudo(c);
  const rotulo = rotuloDoNumero(c);
  const esquerda = Cena === Mercado || Cena === Fabrica || Cena === Moedas || Cena === Obra;
  const sol = { x: esquerda ? 60 + r(50) * 60 : 520 + r(50) * 70, y: 55 + r(51) * 20 };
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: mistura(cor, 22) }}>
      <svg viewBox="0 0 640 360" role="presentation" aria-hidden className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
        <circle cx={sol.x} cy={sol.y} r={46} fill="var(--pk-ipe)" opacity={0.9} />
        <Cena r={r} cor={cor} />
      </svg>
      {numero && (
        <span
          className={`absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-col rounded-md bg-surface-200/95 px-2.5 py-1 text-ink shadow-card ${
            tamanho === "grande" ? "sm:bottom-5 sm:left-5 sm:max-w-md sm:px-4 sm:py-2" : "sm:max-w-[80%]"
          }`}
        >
          <span className={`font-display ${tamanho === "grande" ? "text-h2 sm:text-h1" : "text-h3"}`}>{numero}</span>
          {rotulo && <span className="line-clamp-2 text-caption text-ink-muted">{rotulo}</span>}
        </span>
      )}
    </div>
  );
}
