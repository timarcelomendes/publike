// Finalistas para o cliente: a agência escolhe quem já deu match numa vaga e manda um link
// ao cliente, que vê os currículos (sem contato), o parecer da agência e responde.
// Peças usadas no navegador e no servidor.

import { estudosDoBanco } from "./estudos";
import type { Curriculo, Experiencia } from "./tipos";
import { perguntasDoBanco, textoDaResposta, type Pergunta } from "./vaga-extra";

export const LIMITES_FINALISTAS = { parecer: 2000, comentario: 600, quem: 80 } as const;

export const DECISOES_CLIENTE = {
  entrevistar: { nome: "Quer entrevistar", acao: "Quero entrevistar", selo: "match" },
  nao_seguir: { nome: "Não seguir", acao: "Não seguir", selo: "contorno" },
} as const;
export type DecisaoCliente = keyof typeof DECISOES_CLIENTE;

export function ehDecisao(v: unknown): v is DecisaoCliente {
  return v === "entrevistar" || v === "nao_seguir";
}

/** A resposta do cliente sobre um finalista (o que a agência vê no quadro). */
export type RespostaCliente = {
  decisao: DecisaoCliente | null;
  comentario: string | null;
  quem: string | null;
  decidido_em: string | null;
};

/** Um finalista na lista da agência. */
export type FinalistaDaVaga = RespostaCliente & {
  id: string;
  perfil_id: string;
  parecer: string | null;
  criado_em: string;
};

/** Um finalista como o cliente vê: sem telefone, e-mail, WhatsApp nem o PDF. */
export type FinalistaDoLink = RespostaCliente & {
  id: string;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  parecer: string | null;
  curriculo: Curriculo | null;
  respostas: { pergunta: string; resposta: string }[];
};

export type DadosDoLink = {
  situacao: "valido" | "expirado" | "indisponivel";
  /** quem abriu é a própria agência ("ver como o cliente"): não responde nem conta como aberto */
  previa: boolean;
  expira_em: string;
  agencia: { nome: string; foto: string | null; verificado: boolean };
  vaga: { titulo: string; cidade: string; bairro: string | null; regime: string | null; cliente: string | null } | null;
  finalistas: FinalistaDoLink[];
};

/** O link que o cliente abre. */
export function caminhoDoLink(token: string) {
  return `/finalistas/${token}`;
}

const texto = (v: unknown) => (typeof v === "string" ? v : null);
const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function curriculoDoLink(v: unknown): Curriculo | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const experiencias: Experiencia[] = (Array.isArray(c.experiencias) ? c.experiencias : [])
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      cargo: texto(e.cargo) ?? "",
      onde: texto(e.onde) ?? "",
      inicio: texto(e.inicio) ?? "",
      fim: texto(e.fim) || null,
      descricao: texto(e.descricao) ?? "",
    }))
    .filter((e) => e.cargo && e.inicio);
  return {
    titulo: texto(c.titulo),
    habilidades: textos(c.habilidades),
    escolaridade: texto(c.escolaridade),
    curso: texto(c.curso),
    estudos: estudosDoBanco(c.estudos),
    experiencias,
    cursos: textos(c.cursos),
    cnh: texto(c.cnh),
    disponibilidade: textos(c.disponibilidade),
    // o PDF não vai para o cliente (pode ter telefone e e-mail)
    arquivo: null,
    atualizado_em: texto(c.atualizado_em) ?? "",
  };
}

/** Lê (e confere) o que o banco devolve para a página do cliente. null: link que não existe. */
export function lerDadosDoLink(json: unknown): DadosDoLink | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  const situacao = d.situacao === "valido" || d.situacao === "expirado" ? d.situacao : "indisponivel";
  const ag = (d.agencia ?? {}) as Record<string, unknown>;
  const vg = d.vaga && typeof d.vaga === "object" ? (d.vaga as Record<string, unknown>) : null;
  const perguntas: Pergunta[] = vg ? perguntasDoBanco(vg.perguntas) : [];
  const finalistas: FinalistaDoLink[] = (Array.isArray(d.finalistas) ? d.finalistas : [])
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object" && typeof f.id === "string")
    .map((f) => {
      const respostas = (f.respostas && typeof f.respostas === "object" ? f.respostas : {}) as Record<string, string>;
      return {
        id: f.id as string,
        nome: texto(f.nome) ?? "Candidato",
        foto: texto(f.foto),
        cidade: texto(f.cidade) ?? "",
        bairro: texto(f.bairro),
        parecer: texto(f.parecer),
        decisao: ehDecisao(f.decisao) ? f.decisao : null,
        comentario: texto(f.comentario),
        quem: texto(f.quem),
        decidido_em: texto(f.decidido_em),
        curriculo: curriculoDoLink(f.curriculo),
        respostas: perguntas
          .map((q) => ({ pergunta: q.nome, resposta: textoDaResposta(q, respostas[q.id]) }))
          .filter((r) => r.resposta),
      };
    });
  return {
    situacao,
    previa: d.previa === true,
    expira_em: texto(d.expira_em) ?? "",
    agencia: { nome: texto(ag.nome) ?? "A agência", foto: texto(ag.foto), verificado: ag.verificado === true },
    vaga: vg
      ? {
          titulo: texto(vg.titulo) ?? "",
          cidade: texto(vg.cidade) ?? "",
          bairro: texto(vg.bairro),
          regime: texto(vg.regime),
          cliente: texto(vg.cliente),
        }
      : null,
    finalistas,
  };
}

/** "3 para entrevistar · 1 não segue · 2 sem resposta" */
export function resumoDasRespostas(lista: { decisao: DecisaoCliente | null }[]) {
  const entrevistar = lista.filter((f) => f.decisao === "entrevistar").length;
  const nao = lista.filter((f) => f.decisao === "nao_seguir").length;
  const sem = lista.length - entrevistar - nao;
  return [
    entrevistar ? `${entrevistar} para entrevistar` : "",
    nao ? `${nao} ${nao === 1 ? "não segue" : "não seguem"}` : "",
    sem ? `${sem} sem resposta` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
