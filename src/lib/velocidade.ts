// A velocidade de verdade (migração 20270709120000_velocidade_real.sql; 17/11/2026, "deixe a performance invejável"):
// as medidas que o navegador manda (src/lib/velocidade-cliente.ts → /api/velocidade) e os limites do Google para
// cada uma (bom até o primeiro número; ruim a partir do segundo), os mesmos do PageSpeed e do Search Console.

export type Metrica = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
export type Nota = "good" | "needs-improvement" | "poor";

/** Uma medida: n = a métrica, v = o valor (ms; o CLS sem unidade), r = a nota, a = o elemento, x = as partes. */
export type Medida = { n: Metrica; v: number; r: Nota; a?: string; x?: Record<string, number | string> };

/**
 * O aviso de uma página aberta: i = o código ao acaso desta página aberta, p = a página (o caminho com [nome]),
 * c = celular, k = a conexão, t = o tipo de navegação e as medidas.
 */
export type AvisoDeVelocidade = { i: string; p: string; c: boolean; k?: string | null; t?: string | null; m: Medida[] };

export const METRICAS: Metrica[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];

/** Os limites do Google: bom até [0], ruim a partir de [1]. */
export const LIMITES: Record<Metrica, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export const NOMES: Record<Metrica, { nome: string; o_que: string }> = {
  LCP: { nome: "Maior conteúdo (LCP)", o_que: "quando o maior texto ou imagem da tela aparece" },
  INP: { nome: "Resposta ao toque (INP)", o_que: "quanto a tela demora a reagir a um toque, no pior caso da visita" },
  CLS: { nome: "Estabilidade (CLS)", o_que: "o quanto a página pula enquanto carrega" },
  FCP: { nome: "Primeira pintura (FCP)", o_que: "quando aparece a primeira coisa" },
  TTFB: { nome: "Resposta do servidor (TTFB)", o_que: "quando chega o primeiro pedaço da página" },
};

export function notaDe(metrica: Metrica, valor: number): Nota {
  const [bom, ruim] = LIMITES[metrica];
  return valor <= bom ? "good" : valor <= ruim ? "needs-improvement" : "poor";
}

export function formatarMedida(metrica: Metrica, valor: number) {
  if (metrica === "CLS") return valor.toFixed(2).replace(".", ",");
  if (valor >= 1000) return `${(valor / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.round(valor)} ms`;
}

const NOTAS: Nota[] = ["good", "needs-improvement", "poor"];

/** Confere o aviso que chegou do navegador (o banco confere de novo). null: não vale. */
export function lerAvisoDeVelocidade(corpo: unknown): AvisoDeVelocidade | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  if (typeof c.i !== "string" || !/^[a-z0-9]{8,24}$/.test(c.i)) return null;
  if (typeof c.p !== "string" || c.p.length > 120 || typeof c.c !== "boolean" || !Array.isArray(c.m)) return null;
  const m = c.m
    .slice(0, 5)
    .filter(
      (x): x is Medida =>
        Boolean(x) &&
        typeof x === "object" &&
        METRICAS.includes((x as Medida).n) &&
        typeof (x as Medida).v === "number" &&
        Number.isFinite((x as Medida).v) &&
        (x as Medida).v >= 0 &&
        NOTAS.includes((x as Medida).r),
    )
    .map((x) => ({
      n: x.n,
      v: x.v,
      r: x.r,
      ...(typeof x.a === "string" && x.a ? { a: x.a.slice(0, 160) } : {}),
      ...(x.x && typeof x.x === "object" ? { x: x.x } : {}),
    }));
  if (!m.length) return null;
  return {
    i: c.i,
    p: c.p,
    c: c.c,
    k: typeof c.k === "string" ? c.k.slice(0, 12) : null,
    t: typeof c.t === "string" ? c.t.slice(0, 20) : null,
    m,
  };
}
