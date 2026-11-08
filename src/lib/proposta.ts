// Proposta e admissão (claude/plano-recursos-concorrentes.md, parte 7; migração 20270110120000). Desde 08/11/2026
// (migração 20270312120000), o candidato pode mandar a foto de cada item da lista depois de aceitar, e os arquivos
// somem em até 30 dias (src/lib/documentos-admissao.ts). A empresa confere a lista com o contador.
import type { DocumentosDaProposta } from "./documentos-admissao";

export const DOCUMENTOS_SUGERIDOS = [
  "Documento com foto e CPF (RG ou CNH)",
  "Comprovante de endereço",
  "Título de eleitor",
  "Foto 3x4",
  "Dados da conta para o salário",
  "Comprovante de escolaridade",
  "Certificado de reservista",
  "Certidão de casamento",
  "Certidão de nascimento dos filhos",
  "Cartão de vacina dos filhos",
  "Carteira de trabalho (a digital)",
  "Exame admissional (a empresa marca)",
];

/** Os que já vêm marcados numa proposta nova. */
export const DOCUMENTOS_MARCADOS = DOCUMENTOS_SUGERIDOS.slice(0, 5);

export type SituacaoProposta = "enviada" | "aceita" | "recusada" | "cancelada";

export const SITUACOES_PROPOSTA: Record<SituacaoProposta, { nome: string; tom: "aviso" | "match" | "contorno" }> = {
  enviada: { nome: "Proposta enviada", tom: "aviso" },
  aceita: { nome: "Aceitou a proposta", tom: "match" },
  recusada: { nome: "Recusou a proposta", tom: "contorno" },
  cancelada: { nome: "Proposta cancelada", tom: "contorno" },
};

export type Proposta = {
  id: string;
  anuncio_id: string;
  perfil_id: string;
  salario: string;
  /** "2026-11-16" */
  inicio: string;
  horario: string | null;
  beneficios: string | null;
  recado: string | null;
  apresentar_onde: string | null;
  /** "08:00" */
  apresentar_hora: string | null;
  documentos: string[];
  situacao: SituacaoProposta;
  motivo_recusa: string | null;
  enviada_em: string;
  respondida_em: string | null;
  /** depois do aceite: os documentos (migração 20270312120000), sem os caminhos */
  docs?: DocumentosDaProposta | null;
};

export type PropostaDoCandidato = Proposta & { vaga: string; empresa: string; empresa_id: string };

const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);

export function lerProposta(x: unknown): Proposta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.salario !== "string" || typeof o.inicio !== "string") return null;
  const situacao = String(o.situacao) as SituacaoProposta;
  if (!(situacao in SITUACOES_PROPOSTA)) return null;
  return {
    id: o.id,
    anuncio_id: String(o.anuncio_id),
    perfil_id: String(o.perfil_id),
    salario: o.salario,
    inicio: o.inicio.slice(0, 10),
    horario: texto(o.horario),
    beneficios: texto(o.beneficios),
    recado: texto(o.recado),
    apresentar_onde: texto(o.apresentar_onde),
    apresentar_hora: texto(o.apresentar_hora),
    documentos: Array.isArray(o.documentos) ? o.documentos.filter((d): d is string => typeof d === "string") : [],
    situacao,
    motivo_recusa: texto(o.motivo_recusa),
    enviada_em: String(o.enviada_em),
    respondida_em: texto(o.respondida_em),
  };
}

export function lerPropostaDoCandidato(x: unknown): PropostaDoCandidato | null {
  const p = lerProposta(x);
  if (!p) return null;
  const o = x as Record<string, unknown>;
  return { ...p, vaga: String(o.vaga ?? ""), empresa: String(o.empresa ?? ""), empresa_id: String(o.empresa_id ?? "") };
}

/** "segunda, 16 de novembro" (a data sem fuso: é o dia combinado). */
export function textoDoDia(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "16/11/2026 às 14:32" */
export function dataEHora(iso: string) {
  return new Date(iso)
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(", ", " às ");
}
