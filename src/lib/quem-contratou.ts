// "Quem você contratou?" com os nomes e um toque (migração 20271006120000): os tipos da página do link, a frase da
// resposta e a escolha que o botão do e-mail traz (?p=<pessoa>, ?r=ainda ou ?r=ninguem). Sem dependência do servidor.

export type RespostaQuemContratou = "contratei" | "ainda_nao" | "ninguem";

export type PessoaAceita = {
  id: string;
  /** o nome curto ("Ana S.") */
  nome: string;
  foto: string | null;
  aceito_em: string;
  /** já está em Contratados */
  contratado: boolean;
};

/** O que a página do link mostra (public.quem_contratou_pelo_link). */
export type PerguntaQuemContratou = {
  anuncio_id: string;
  titulo: string;
  /** quantas vagas o anúncio tem (o "A vaga está completa" vem marcado quando chega nesse número) */
  vagas: number;
  /** a vaga é de contato direto: ninguém foi aceito, a pessoa recebeu o WhatsApp da empresa ao se candidatar */
  contato_direto: boolean;
  removida: boolean;
  no_ar: boolean;
  preenchida: boolean;
  empresa: string | null;
  empresa_foto: string | null;
  resposta: RespostaQuemContratou | null;
  respondida_em: string | null;
  pessoas: PessoaAceita[];
};

/** O que a resposta fez (privado.gravar_quem_contratou). */
export type ResultadoQuemContratou = {
  resposta: RespostaQuemContratou;
  contratados: number;
  novos: number;
  preenchida: boolean;
  avisados: number;
  confirmou_aberta: boolean;
};

/** A página do link: confere o formato do que veio do banco (nulo se não serve). */
export function lerPergunta(dados: unknown): PerguntaQuemContratou | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.anuncio_id !== "string" || typeof d.titulo !== "string") return null;
  const pessoas = Array.isArray(d.pessoas)
    ? d.pessoas
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string")
        .map((p) => ({
          id: String(p.id),
          nome: typeof p.nome === "string" && p.nome.trim() ? p.nome : "Sem nome",
          foto: typeof p.foto === "string" ? p.foto : null,
          aceito_em: typeof p.aceito_em === "string" ? p.aceito_em : "",
          contratado: p.contratado === true,
        }))
    : [];
  const resposta = ["contratei", "ainda_nao", "ninguem"].includes(String(d.resposta))
    ? (d.resposta as RespostaQuemContratou)
    : null;
  return {
    anuncio_id: d.anuncio_id,
    titulo: d.titulo,
    vagas: Math.max(1, Number(d.vagas) || 1),
    contato_direto: d.contato_direto === true,
    removida: d.removida === true,
    no_ar: d.no_ar === true,
    preenchida: d.preenchida === true,
    empresa: typeof d.empresa === "string" ? d.empresa : null,
    empresa_foto: typeof d.empresa_foto === "string" ? d.empresa_foto : null,
    resposta,
    respondida_em: typeof d.respondida_em === "string" ? d.respondida_em : null,
    pessoas,
  };
}

/**
 * A escolha que o botão do e-mail traz: "Contratei Ana S." chega com `?p=<id da Ana>` (ela vem marcada) e as outras
 * respostas com `?r=ainda` ou `?r=ninguem` (abre a parte delas). Nada acontece sem o toque na página: o leitor de
 * e-mail que abre os links sozinho não responde por ninguém.
 */
export function escolhaDoLink(
  busca: Record<string, string | string[] | undefined>,
  pessoas: PessoaAceita[],
): { marcadas: string[]; parte: "ainda_nao" | "ninguem" | null } {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const p = um(busca.p);
  const r = um(busca.r);
  const ids = new Set(pessoas.map((x) => x.id));
  return {
    marcadas: ids.has(p) ? [p] : [],
    parte: r === "ainda" ? "ainda_nao" : r === "ninguem" ? "ninguem" : null,
  };
}

/** O "A vaga está completa" vem marcado quando quem está em Contratados (com as escolhidas) chega nas vagas do anúncio. */
export function completaPorPadrao(pergunta: PerguntaQuemContratou, marcadas: string[]) {
  if (!pergunta.no_ar) return false;
  const ja = pergunta.pessoas.filter((p) => p.contratado).map((p) => p.id);
  return new Set([...ja, ...marcadas]).size >= pergunta.vagas;
}

const comAvisados = (n: number) =>
  n === 1 ? " e 1 pessoa que esperava recebe o retorno" : n > 1 ? ` e ${n} pessoas que esperavam recebem o retorno` : "";

/** O que a resposta fez, em uma frase (embaixo dos botões e na tela de obrigado). */
export function fraseDaResposta(r: ResultadoQuemContratou): string {
  if (r.resposta === "ainda_nao")
    return r.confirmou_aberta
      ? "Tudo bem. A vaga continua no ar e aparece como confirmada para quem procura. A gente pergunta de novo em uma semana."
      : "Tudo bem. A gente pergunta de novo em uma semana.";
  if (r.resposta === "ninguem")
    return r.preenchida
      ? `Obrigado por contar. A vaga saiu do ar${comAvisados(r.avisados)}.`
      : "Obrigado por contar. Isso ajuda o Publike a mandar candidatos melhores para as suas próximas vagas.";
  const quem =
    r.contratados === 1
      ? "A pessoa que você contratou está em Contratados e recebe os parabéns"
      : `As ${r.contratados} pessoas que você contratou estão em Contratados e recebem os parabéns`;
  return (
    quem +
    (r.preenchida ? `. A vaga saiu do ar${comAvisados(r.avisados)}` : "") +
    ". Daqui a 7 dias, a gente pergunta se começou e se você chamaria de novo."
  );
}

/** "Ana S.", "Ana S. e Bruno C.", "3 pessoas". */
export function quemFoiEscolhido(nomes: string[]) {
  if (nomes.length === 0) return "";
  if (nomes.length <= 2) return nomes.join(" e ");
  return `${nomes.length} pessoas`;
}
