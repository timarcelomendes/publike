// Colocações da agência: quem foi contratado para o cliente, a taxa cobrada (e se já recebeu)
// e a garantia de reposição. Sem dependências: serve no navegador e no servidor.

export type Colocacao = {
  anuncio_id: string;
  perfil_id: string;
  /** "2026-10-19" */
  inicio: string;
  taxa: number | null;
  paga: boolean;
  garantia_dias: number;
  /** saiu antes do fim da garantia: reposição */
  saiu_em: string | null;
  nota: string | null;
};

/** As garantias mais comuns, em dias (o campo aceita de 0 a 365). */
export const GARANTIAS = [30, 45, 60, 90] as const;
export const GARANTIA_PADRAO = 90;

const DIA = 86_400_000;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-19" → milissegundos (meia-noite UTC: só para contar dias). */
function emMs(data: string) {
  const m = DATA.exec(data);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
}

function deMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "19/10/2026" a partir de "2026-10-19". */
export function dataBR(data: string) {
  const m = DATA.exec(data);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data;
}

/** "19/10" a partir de "2026-10-19". */
export function diaMesBR(data: string) {
  const m = DATA.exec(data);
  return m ? `${m[3]}/${m[2]}` : data;
}

/** Hoje em Brasília, como "2026-10-19". */
export function hojeEmBrasilia(agora: number) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
}

/** O último dia da garantia. */
export function fimDaGarantia(c: Pick<Colocacao, "inicio" | "garantia_dias">) {
  return deMs(emMs(c.inicio) + c.garantia_dias * DIA);
}

export type SituacaoColocacao =
  | { tipo: "reposicao"; texto: string }
  | { tipo: "garantia"; texto: string; faltam: number }
  | { tipo: "cumprida"; texto: string };

/** Em garantia (faltam N dias), garantia cumprida ou reposição (saiu dentro da garantia). */
export function situacaoDaColocacao(c: Colocacao, hoje: string): SituacaoColocacao {
  const fim = fimDaGarantia(c);
  if (c.saiu_em && c.saiu_em <= fim) {
    return { tipo: "reposicao", texto: `Saiu em ${dataBR(c.saiu_em)}, dentro da garantia: reposição` };
  }
  if (c.saiu_em) return { tipo: "cumprida", texto: `Garantia cumprida (saiu em ${dataBR(c.saiu_em)})` };
  if (c.garantia_dias === 0) return { tipo: "cumprida", texto: "Sem garantia" };
  if (hoje <= fim) {
    const faltam = Math.round((emMs(fim) - emMs(hoje)) / DIA);
    return {
      tipo: "garantia",
      faltam,
      texto: `Em garantia até ${dataBR(fim)} (${faltam === 0 ? "acaba hoje" : faltam === 1 ? "falta 1 dia" : `faltam ${faltam} dias`})`,
    };
  }
  return { tipo: "cumprida", texto: `Garantia cumprida em ${dataBR(fim)}` };
}

/** Os números das colocações: taxas, quanto falta receber, quantas em garantia e em reposição. */
export function resumoDasColocacoes(lista: Colocacao[], hoje: string) {
  const situacoes = lista.map((c) => situacaoDaColocacao(c, hoje));
  return {
    total: lista.length,
    taxas: lista.reduce((s, c) => s + (c.taxa ?? 0), 0),
    aReceber: lista.reduce((s, c) => s + (c.paga ? 0 : (c.taxa ?? 0)), 0),
    emGarantia: situacoes.filter((s) => s.tipo === "garantia").length,
    reposicoes: situacoes.filter((s) => s.tipo === "reposicao").length,
  };
}

/** Do banco (numeric chega como texto em alguns casos). */
export function colocacaoDoBanco(r: {
  anuncio_id: string;
  perfil_id: string;
  inicio: string;
  taxa: number | string | null;
  paga: boolean;
  garantia_dias: number;
  saiu_em: string | null;
  nota: string | null;
}): Colocacao {
  const taxa = r.taxa === null ? null : Number(r.taxa);
  return { ...r, taxa: taxa !== null && Number.isFinite(taxa) ? taxa : null };
}
