// Etapas sob medida e horários livres (claude/plano-recursos-concorrentes.md, parte 5; migração 20270108120000).

export const MAX_ETAPAS_PROPRIAS = 6;

export type BaseDaEtapa = "analise" | "entrevista" | "contratado";

export const BASES: Record<BaseDaEtapa, string> = {
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratados",
};

export type EtapaPropria = { id: string; nome: string; base: BaseDaEtapa };

export function lerEtapasProprias(x: unknown): EtapaPropria[] {
  return (Array.isArray(x) ? x : [])
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .filter((e) => typeof e.id === "string" && typeof e.nome === "string" && String(e.base) in BASES)
    .map((e) => ({ id: e.id as string, nome: e.nome as string, base: e.base as BaseDaEtapa }));
}

/** A coluna do quadro: uma etapa de hoje ou uma própria (`sub:<id>`). */
export function chaveDaSubetapa(id: string) {
  return `sub:${id}`;
}

export const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export type FaixaLivre = { dia: number; de: string; ate: string };

export function lerFaixas(x: unknown): FaixaLivre[] {
  return (Array.isArray(x) ? x : [])
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({ dia: Number(f.dia), de: String(f.de), ate: String(f.ate) }))
    .filter((f) => f.dia >= 0 && f.dia <= 6 && /^\d{2}:\d{2}$/.test(f.de) && /^\d{2}:\d{2}$/.test(f.ate));
}

const BRASILIA = -3 * 3600e3;

/**
 * Os próximos horários vagos: a partir de amanhã, dentro das faixas da semana, a cada `passo` minutos, sem bater
 * com as entrevistas já marcadas ou oferecidas. Devolve no formato do campo ("2026-11-04T14:00", Brasília).
 */
export function proximosHorarios(
  faixas: FaixaLivre[],
  ocupados: { inicio: number; fim: number }[],
  agora: number,
  { quantos = 5, duracaoMin = 30, passoMin = 60, dias = 21 } = {},
): string[] {
  const saida: string[] = [];
  // o começo de amanhã em Brasília (sem horário de verão desde 2019)
  const hojeBr = new Date(agora + BRASILIA);
  const inicioAmanha = Date.UTC(hojeBr.getUTCFullYear(), hojeBr.getUTCMonth(), hojeBr.getUTCDate() + 1) - BRASILIA;
  for (let d = 0; d < dias && saida.length < quantos; d++) {
    const diaInicio = inicioAmanha + d * 86_400_000;
    const dia = new Date(diaInicio + BRASILIA).getUTCDay();
    for (const f of faixas.filter((x) => x.dia === dia).sort((a, b) => a.de.localeCompare(b.de))) {
      const [hd, md] = f.de.split(":").map(Number);
      const [ha, ma] = f.ate.split(":").map(Number);
      for (let m = hd * 60 + md; m + duracaoMin <= ha * 60 + ma && saida.length < quantos; m += passoMin) {
        const inicio = diaInicio + m * 60_000;
        const fim = inicio + duracaoMin * 60_000;
        if (ocupados.some((o) => inicio < o.fim && fim > o.inicio)) continue;
        const br = new Date(inicio + BRASILIA);
        saida.push(br.toISOString().slice(0, 16));
      }
    }
  }
  return saida;
}

/** "há 3 dias" / "desde hoje". */
export function textoDesde(iso: string, agora: number) {
  const dias = Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "desde hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/** Parado demais: 5 dias ou mais em Novos, Em análise ou Entrevista. */
export const DIAS_PARADO = 5;
