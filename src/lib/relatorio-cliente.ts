// O relatório por cliente da agência (migração 20270409120000; claude/plano-planos-empresa-e-agencia.md, etapa 2).
// Só números: nenhum nome nem contato de candidato.

export type TotaisDoRelatorio = {
  vagas: number;
  candidatos: number;
  triagem: number;
  entrevista: number;
  finalistas: number;
  respondidos: number;
  contratados: number;
  /** a mediana de dias entre publicar a vaga e os primeiros finalistas; null sem finalistas */
  dias_finalistas: number | null;
};

export type VagaDoRelatorio = Omit<TotaisDoRelatorio, "vagas" | "respondidos"> & {
  titulo: string;
  status: string;
  criado_em: string;
  preenchida_em: string | null;
};

export type Relatorio = {
  liberado: boolean;
  cliente: string;
  agencia: { nome: string; foto: string | null; verificado: boolean };
  marca: { cor: string | null; foto: string | null } | null;
  de: string;
  ate: string;
  totais: TotaisDoRelatorio;
  vagas: VagaDoRelatorio[];
  /** o link do cliente, quando já existe (só na tela da agência) */
  token?: string | null;
  /** a própria agência abrindo o link */
  previa?: boolean;
};

/** Os períodos para escolher (em dias); o padrão é 90. */
export const PERIODOS = [
  { valor: "30", nome: "Últimos 30 dias", dias: 30 },
  { valor: "90", nome: "Últimos 90 dias", dias: 90 },
  { valor: "365", nome: "Último ano", dias: 365 },
] as const;

export function periodoPedido(valor: string | undefined) {
  return PERIODOS.find((p) => p.valor === valor) ?? PERIODOS[1];
}

/** O "de" e o "até" (datas de São Paulo) do período. */
export function datasDoPeriodo(dias: number, agora: number) {
  const fmt = (t: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(t),
    );
  return { de: fmt(agora - (dias - 1) * 86_400_000), ate: fmt(agora) };
}

const num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);
const numOuNulo = (x: unknown) => (x === null || x === undefined ? null : Number(x));
const texto = (x: unknown) => (typeof x === "string" ? x : "");

/** O jsonb do banco, sem confiar no formato; null quando não veio nada. */
export function lerRelatorio(x: unknown): Relatorio | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const ag = (o.agencia ?? {}) as Record<string, unknown>;
  const t = (o.totais ?? {}) as Record<string, unknown>;
  const m = o.marca && typeof o.marca === "object" ? (o.marca as Record<string, unknown>) : null;
  return {
    liberado: o.liberado === true,
    cliente: texto(o.cliente),
    agencia: { nome: texto(ag.nome), foto: typeof ag.foto === "string" ? ag.foto : null, verificado: ag.verificado === true },
    marca: m ? { cor: typeof m.cor === "string" ? m.cor : null, foto: typeof m.foto === "string" ? m.foto : null } : null,
    de: texto(o.de),
    ate: texto(o.ate),
    totais: {
      vagas: num(t.vagas),
      candidatos: num(t.candidatos),
      triagem: num(t.triagem),
      entrevista: num(t.entrevista),
      finalistas: num(t.finalistas),
      respondidos: num(t.respondidos),
      contratados: num(t.contratados),
      dias_finalistas: numOuNulo(t.dias_finalistas),
    },
    vagas: Array.isArray(o.vagas)
      ? o.vagas.map((v) => {
          const r = (v ?? {}) as Record<string, unknown>;
          return {
            titulo: texto(r.titulo),
            status: texto(r.status),
            criado_em: texto(r.criado_em),
            preenchida_em: typeof r.preenchida_em === "string" ? r.preenchida_em : null,
            candidatos: num(r.candidatos),
            triagem: num(r.triagem),
            entrevista: num(r.entrevista),
            finalistas: num(r.finalistas),
            contratados: num(r.contratados),
            dias_finalistas: numOuNulo(r.dias_finalistas),
          };
        })
      : [],
    token: typeof o.token === "string" ? o.token : null,
    previa: o.previa === true,
  };
}
