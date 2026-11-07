// A trilha dos candidatos (claude/plano-trilha-dos-candidatos.md): uma linha por candidato e as etapas da vaga em
// colunas (Curtiu, Aceite, Em análise, Entrevista, Contratado e as etapas próprias depois da base delas). Aqui só a
// conta, sem banco: os passos (o quê e quando) viram as células.

import type { EtapaPropria } from "./etapas-proprias";

export type Passo = { o_que: string; em: string };

export type ColunaDaTrilha = { chave: string; nome: string };

/** passou: já passou dali; atual: está ali agora; parou: o processo parou ali; contratado: chegou ao fim */
export type EstadoDaCelula = "passou" | "atual" | "parou" | "contratado";

export type CelulaDaTrilha = { estado: EstadoDaCelula; em: string | null; rotulo: string | null } | null;

export type CandidatoNaTrilha = {
  perfil_id: string;
  /** a curtida: pendente, match, dispensada, desfeito */
  status: string;
  /** aceito esperando o currículo */
  aceita: boolean;
  curtido_em: string;
  etapa: string;
  subetapa: string | null;
  /** desde quando está onde está (sem histórico, a data da etapa atual) */
  desde: string | null;
};

export type SituacaoNaTrilha = "contratado" | "parou" | "andamento";

const BASES = ["analise", "entrevista", "contratado"] as const;
const NOMES_DAS_BASES: Record<(typeof BASES)[number], string> = {
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratado",
};

/** As colunas da vaga: as fixas e as etapas próprias depois da base de cada uma. */
export function colunasDaTrilha(proprias: EtapaPropria[] | null): ColunaDaTrilha[] {
  const colunas: ColunaDaTrilha[] = [
    { chave: "curtiu", nome: "Curtiu" },
    { chave: "aceite", nome: "Aceite" },
  ];
  for (const base of BASES) {
    colunas.push({ chave: base, nome: NOMES_DAS_BASES[base] });
    for (const p of (proprias ?? []).filter((e) => e.base === base)) colunas.push({ chave: `sub:${p.id}`, nome: p.nome });
  }
  return colunas;
}

/** A situação do candidato (o selo ao lado do nome e os números do alto). */
export function situacaoNaTrilha(c: CandidatoNaTrilha): SituacaoNaTrilha {
  if (c.status === "match" && c.etapa === "contratado") return "contratado";
  if (c.status === "dispensada" || c.status === "desfeito" || c.etapa === "nao_seguiu") return "parou";
  return "andamento";
}

/**
 * As células de um candidato, na ordem das colunas. A data de cada etapa é a primeira vez que a pessoa chegou ali.
 * A etapa onde a pessoa está agora (ou onde o processo parou) é a "ponta": antes dela, as etapas por onde passou;
 * depois, nada (quem voltou de etapa não mostra as da frente).
 */
export function celulasDaTrilha(c: CandidatoNaTrilha, passos: Passo[], colunas: ColunaDaTrilha[]): CelulaDaTrilha[] {
  const primeira = new Map<string, string>();
  const marcar = (chave: string, em: string | null | undefined) => {
    if (em && !primeira.has(chave)) primeira.set(chave, em);
  };
  marcar("curtiu", c.curtido_em);
  let parouEm: string | null = null;
  for (const p of passos) {
    if (p.o_que === "curtiu") marcar("curtiu", p.em);
    else if (p.o_que === "aceita" || p.o_que === "resposta:match" || p.o_que === "curtida:match") marcar("aceite", p.em);
    else if (p.o_que === "resposta:dispensada" || p.o_que === "curtida:dispensada") parouEm ??= p.em;
    else if (p.o_que === "resposta:desfeito" || p.o_que === "curtida:desfeito" || p.o_que === "etapa:nao_seguiu")
      parouEm = p.em;
    else if (p.o_que.startsWith("etapa:")) marcar(p.o_que.slice(6), p.em);
    else if (p.o_que.startsWith("sub:")) marcar(p.o_que, p.em);
  }
  // quem deu match antes do histórico existir: o aceite, sem a data
  const aceitou = c.status === "match" || c.status === "desfeito" || c.aceita;
  // a etapa atual sem passo no histórico (dados antigos): a data de "desde"
  const naBase = (BASES as readonly string[]).includes(c.etapa);
  if (naBase && !primeira.has(c.etapa)) primeira.set(c.etapa, c.desde ?? "");
  if (naBase && c.subetapa && !primeira.has(`sub:${c.subetapa}`)) primeira.set(`sub:${c.subetapa}`, c.desde ?? "");
  const alcancou = (chave: string) => primeira.has(chave) || (chave === "aceite" && aceitou);

  const indice = (chave: string) => colunas.findIndex((col) => col.chave === chave);
  const situacao = situacaoNaTrilha(c);
  const iAceite = indice("aceite");
  // a ponta: onde a pessoa está agora (ou onde parou)
  let ponta: number;
  if (!aceitou) ponta = iAceite;
  else if (situacao === "parou") {
    ponta = iAceite;
    colunas.forEach((col, i) => {
      if (alcancou(col.chave)) ponta = i;
    });
  } else {
    const sub = naBase && c.subetapa ? indice(`sub:${c.subetapa}`) : -1;
    ponta = sub >= 0 ? sub : naBase ? indice(c.etapa) : iAceite;
  }

  return colunas.map((col, i) => {
    if (i > ponta) return null;
    const em = primeira.get(col.chave) || null;
    if (i < ponta) return alcancou(col.chave) ? { estado: "passou", em, rotulo: null } : null;
    if (situacao === "parou")
      return {
        estado: "parou",
        em: parouEm ?? em,
        rotulo:
          c.status === "desfeito" ? "Match desfeito" : c.status === "dispensada" ? "Não foi dessa vez" : "Não seguiu",
      };
    if (situacao === "contratado") return { estado: "contratado", em, rotulo: "Contratado" };
    if (col.chave === "aceite")
      return !aceitou
        ? { estado: "atual", em: c.curtido_em, rotulo: "Espera a sua resposta" }
        : { estado: "atual", em, rotulo: c.aceita ? "Falta o currículo" : "Deu match" };
    return { estado: "atual", em, rotulo: "Aqui agora" };
  });
}

/** A posição da ponta (para ordenar quem foi mais longe primeiro). */
export function pontaDaTrilha(celulas: CelulaDaTrilha[]) {
  let ponta = 0;
  celulas.forEach((c, i) => {
    if (c) ponta = i;
  });
  return ponta;
}
