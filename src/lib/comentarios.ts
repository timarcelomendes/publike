// Os comentários nas vagas (claude/plano-comentarios-e-indicar-por-email.md, parte 2; migração 20270318120000).

export type Comentario = {
  id: string;
  resposta_a: string | null;
  texto: string;
  status: "no_ar" | "revisao" | "retido" | "escondido";
  motivo: string | null;
  criado_em: string;
  editado_em: string | null;
  autor_id: string;
  nome: string;
  tipo: string;
  foto: string | null;
  de_quem_publicou: boolean;
  meu: boolean;
};

export type ComentariosDaVaga = {
  ligados: boolean;
  /** a vaga está no ar (fechada: os comentários ficam, ninguém escreve) */
  aberta: boolean;
  /** quem está vendo publicou a vaga */
  dono: boolean;
  logado: boolean;
  itens: Comentario[];
};

/**
 * No feed: quantos comentários no ar a vaga tem, se aceita comentários (quem publicou pode desligar) e o último
 * (quem e o começo do texto).
 */
export type ResumoComentarios = { total: number; ligados: boolean; ultimo: { nome: string; texto: string } | null };

export const SEM_COMENTARIOS: ResumoComentarios = { total: 0, ligados: true, ultimo: null };

/** Quantos comentários no ar a conversa tem. */
export function contarComentarios(dados: ComentariosDaVaga) {
  return dados.itens.filter((c) => c.status === "no_ar").length;
}

export const MAXIMO_COMENTARIO = 500;
/** Editar só até 15 minutos depois (o banco confere). */
export const MINUTOS_PARA_EDITAR = 15;

const STATUS = new Set(["no_ar", "revisao", "retido", "escondido"]);

/** Lê o que o banco devolve (jsonb), sem confiar no formato. */
export function lerComentarios(dados: unknown): ComentariosDaVaga | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  const itens = Array.isArray(d.itens) ? d.itens : [];
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    ligados: d.ligados !== false,
    aberta: d.aberta === true,
    dono: d.dono === true,
    logado: d.logado === true,
    itens: itens.flatMap((x): Comentario[] => {
      if (!x || typeof x !== "object") return [];
      const c = x as Record<string, unknown>;
      const id = texto(c.id);
      const corpo = texto(c.texto);
      const status = texto(c.status);
      if (!id || !corpo || !status || !STATUS.has(status)) return [];
      return [
        {
          id,
          resposta_a: texto(c.resposta_a),
          texto: corpo,
          status: status as Comentario["status"],
          motivo: texto(c.motivo),
          criado_em: texto(c.criado_em) ?? new Date(0).toISOString(),
          editado_em: texto(c.editado_em),
          autor_id: texto(c.autor_id) ?? "",
          nome: texto(c.nome) ?? "Conta do Publike",
          tipo: texto(c.tipo) ?? "pessoa",
          foto: texto(c.foto),
          de_quem_publicou: c.de_quem_publicou === true,
          meu: c.meu === true,
        },
      ];
    }),
  };
}

/**
 * O comentário parece candidatura ("tenho interesse", "quero a vaga", "meu currículo", "me chama")? Antes de mandar, o
 * site lembra que comentário não chega como candidatura e mostra o Curtir.
 */
const CANDIDATURA =
  /\b(tenho interesse|interessad[ao]|quero (a|essa|esta) vaga|quero trabalhar|me candidat|candidatar|meu curr[ií]culo|mand(o|ei|ar) (o |meu )?curr[ií]culo|me chama|me chame|me liga|chama (no|pv|privado)|estou dispon[ií]vel|t[ôo] dispon[ií]vel|preciso (muito )?(de|desse|deste) (emprego|trabalho)|ainda (tem|est[aá]) (a )?vaga)\b/i;

export function pareceCandidatura(texto: string) {
  return CANDIDATURA.test(texto.normalize("NFC"));
}

/** As perguntas primeiro (com as respostas embaixo): as respondidas por quem publicou, depois as mais novas. */
export function organizarComentarios(itens: Comentario[]) {
  const respostas = new Map<string, Comentario[]>();
  for (const c of itens) {
    if (!c.resposta_a) continue;
    respostas.set(c.resposta_a, [...(respostas.get(c.resposta_a) ?? []), c]);
  }
  const raiz = itens.filter((c) => !c.resposta_a);
  const respondida = (c: Comentario) => (respostas.get(c.id) ?? []).some((r) => r.de_quem_publicou);
  raiz.sort((a, b) => {
    const ra = respondida(a) ? 1 : 0;
    const rb = respondida(b) ? 1 : 0;
    if (ra !== rb) return rb - ra;
    return b.criado_em.localeCompare(a.criado_em);
  });
  return raiz.map((c) => ({ ...c, respostas: respostas.get(c.id) ?? [] }));
}
