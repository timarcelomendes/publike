// As dicas de novidade (claude/plano-comentarios-e-indicar-por-email.md, parte 3): o balão "Novo" junto do botão ou
// do campo novo. Cada pessoa vê cada dica uma vez (com conta, guardado na conta: vale no celular e no computador;
// sem conta, no aparelho). Quem já tinha conta vê no primeiro acesso depois da melhoria; quem cria conta depois vê
// também, sem prazo. Uma dica por página: vale a primeira desta lista que estiver na tela e ainda não foi vista.
// Para aposentar uma dica, `ligada: false`.

export type Dica = {
  chave: string;
  /** o texto do balão, depois do selo "Novo" */
  texto: string;
  ligada: boolean;
};

export const DICAS = [
  {
    chave: "comentarios",
    texto: "Tire suas dúvidas sobre a vaga aqui. Quem publicou responde para todo mundo ver.",
    ligada: true,
  },
  {
    chave: "comentarios-empresa",
    texto: "Candidatos podem perguntar nos comentários das suas vagas. Responder rápido traz mais candidatos.",
    ligada: true,
  },
  {
    chave: "indicar-email",
    texto: "Mande esta vaga para o e-mail de um amigo. Se ele não tiver conta, cria em um toque.",
    ligada: true,
  },
] as const satisfies readonly Dica[];

export type ChaveDica = (typeof DICAS)[number]["chave"];

export const CHAVE_DICA = /^[a-z0-9_-]{2,60}$/;

/** A ordem das dicas (a primeira da lista ganha quando duas estão na mesma página). */
export function ordemDaDica(chave: string) {
  const i = DICAS.findIndex((d) => d.chave === chave);
  return i < 0 ? DICAS.length : i;
}

export function dicaLigada(chave: string) {
  return DICAS.some((d) => d.chave === chave && d.ligada);
}
