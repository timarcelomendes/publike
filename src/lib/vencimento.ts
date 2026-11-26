// O vencimento com um toque (migração 20271010120000): os tipos da página do link e a escolha que o botão do e-mail
// traz (?r=prorrogar, ?r=preenchi ou ?r=encerrar). Sem dependência do servidor.

export type RespostaVencimento = "prorrogar" | "preenchi" | "encerrar";

export const RESPOSTAS_VENCIMENTO: RespostaVencimento[] = ["prorrogar", "preenchi", "encerrar"];

/** O que a página do link mostra (public.vencimento_pelo_link). */
export type SituacaoVencimento = {
  anuncio_id: string;
  titulo: string;
  empresa: string | null;
  empresa_foto: string | null;
  status: string;
  expira_em: string;
  no_ar: boolean;
  preenchida: boolean;
  removida: boolean;
  /** suspensa por falta de retorno (migração 20271008120000): prorrogar não religa */
  suspensa: boolean;
  resposta: RespostaVencimento | null;
  respondida_em: string | null;
  /** quem se candidatou e ainda espera (sem resposta, ou aceito sem chegar a Contratado ou Não seguiu) */
  esperando: number;
  aceitos: number;
  prazo_dias: number;
};

/** O que a resposta fez (public.responder_vencimento_pelo_link). */
export type ResultadoVencimento = {
  resposta: RespostaVencimento;
  expira_em: string | null;
  avisados: number;
  /** o caminho do "Quem você contratou?", quando alguém foi aceito */
  quem_contratou: string | null;
};

export function lerSituacao(dados: unknown): SituacaoVencimento | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.anuncio_id !== "string" || typeof d.titulo !== "string") return null;
  return {
    anuncio_id: d.anuncio_id,
    titulo: d.titulo,
    empresa: typeof d.empresa === "string" ? d.empresa : null,
    empresa_foto: typeof d.empresa_foto === "string" ? d.empresa_foto : null,
    status: String(d.status ?? ""),
    expira_em: String(d.expira_em ?? ""),
    no_ar: d.no_ar === true,
    preenchida: d.preenchida === true,
    removida: d.removida === true,
    suspensa: d.suspensa === true,
    resposta: RESPOSTAS_VENCIMENTO.includes(d.resposta as RespostaVencimento) ? (d.resposta as RespostaVencimento) : null,
    respondida_em: typeof d.respondida_em === "string" ? d.respondida_em : null,
    esperando: Number(d.esperando ?? 0),
    aceitos: Number(d.aceitos ?? 0),
    prazo_dias: Number(d.prazo_dias ?? 30) || 30,
  };
}

/** A escolha que vem do botão do e-mail (?r=). Só deixa escolhida: a resposta é o toque na página. */
export function escolhaDoVencimento(busca: Record<string, string | string[] | undefined>): RespostaVencimento | null {
  const r = Array.isArray(busca.r) ? busca.r[0] : busca.r;
  return RESPOSTAS_VENCIMENTO.includes(r as RespostaVencimento) ? (r as RespostaVencimento) : null;
}

/** A frase depois da resposta. */
export function fraseDoVencimento(r: ResultadoVencimento, dataFinal: string | null): string {
  const avisados =
    r.avisados > 0 ? ` ${r.avisados === 1 ? "A pessoa que esperava recebeu" : `As ${r.avisados} pessoas que esperavam receberam`} o retorno.` : "";
  if (r.resposta === "prorrogar") return `A vaga está no ar${dataFinal ? ` até ${dataFinal}` : ""}.`;
  if (r.resposta === "preenchi") return `Vaga marcada como preenchida e fora do ar.${avisados}`;
  return `Vaga encerrada.${avisados}`;
}
