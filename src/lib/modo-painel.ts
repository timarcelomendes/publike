// O painel tem três modos, um para cada jeito de usar o Publike:
//   Contratar ... vagas, candidatos e entrevistas (comércio, empresa, agência)
//   Trabalhar ... vagas curtidas, currículo e entrevistas (quem procura trabalho)
//   Serviços .... pedidos, vitrine e avaliações (quem presta serviço)
// Cada conta abre no modo dela; quem faz mais de uma coisa troca no topo do menu. A
// escolha fica num cookie (a página Hoje e o menu leem do servidor).

import type { Intencao } from "./intencao";

export type ModoPainel = "contratar" | "trabalhar" | "servicos";

export const COOKIE_MODO = "publike_modo_painel";

export const MODOS: { valor: ModoPainel; nome: string; ajuda: string }[] = [
  { valor: "contratar", nome: "Contratar", ajuda: "Vagas, candidatos e entrevistas" },
  { valor: "trabalhar", nome: "Trabalhar", ajuda: "Vagas que você curtiu, currículo e entrevistas" },
  { valor: "servicos", nome: "Serviços", ajuda: "Pedidos, vitrine e avaliações" },
];

export function lerModo(valor: string | null | undefined): ModoPainel | null {
  return MODOS.some((m) => m.valor === valor) ? (valor as ModoPainel) : null;
}

/** O modo de quem ainda não escolheu: pelo tipo de conta e pelo que disse que quer fazer. */
export function modoPadrao(tipoConta: string | null | undefined, intencao: Intencao | null): ModoPainel {
  if ((tipoConta && tipoConta !== "pessoa") || intencao === "contratar_pessoa") return "contratar";
  if (intencao === "oferecer_servico") return "servicos";
  return "trabalhar";
}

/** Contadores que aparecem nas seções do menu. */
export type Contadores = { responder: number; pedidos: number; mensagens: number };

export type Secao = {
  href: string;
  nome: string;
  icone:
    | "hoje"
    | "caixa"
    | "candidatos"
    | "vagas"
    | "conversas"
    | "curtidas"
    | "avisos"
    | "curriculo"
    | "pedidos"
    | "vitrine"
    | "avaliacoes";
  contador?: keyof Contadores;
};

export const SECOES: Record<ModoPainel, Secao[]> = {
  contratar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/caixa", nome: "Caixa de entrada", icone: "caixa", contador: "responder" },
    { href: "/painel/anuncios?tipo=vaga", nome: "Minhas vagas", icone: "vagas" },
    { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens" },
  ],
  trabalhar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/curtidas?tipo=vaga", nome: "Candidaturas", icone: "curtidas" },
    { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens" },
    { href: "/painel/seguindo", nome: "Avisos e seguindo", icone: "avisos" },
    { href: "/perfil/curriculo", nome: "Currículo", icone: "curriculo" },
  ],
  servicos: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/anuncios?tipo=servico", nome: "Pedidos", icone: "pedidos", contador: "pedidos" },
    { href: "/painel/servicos", nome: "Vitrine", icone: "vitrine" },
    { href: "/painel/avaliacoes", nome: "Avaliações", icone: "avaliacoes" },
    { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens" },
  ],
};

/** O resto do painel, no fim do menu (o que não é do modo aberto). */
export const OUTRAS: Record<ModoPainel, { href: string; nome: string }[]> = {
  contratar: [
    { href: "/painel/candidatos", nome: "Lista de candidatos e planilha" },
    { href: "/painel/matches", nome: "Matches" },
    { href: "/painel/curtidas", nome: "O que você curtiu" },
    { href: "/painel/seguindo", nome: "Seguindo" },
  ],
  trabalhar: [
    { href: "/painel/matches", nome: "Matches" },
    { href: "/painel/curtidas?tipo=servico", nome: "Serviços que você pediu" },
    { href: "/painel/anuncios", nome: "Meus anúncios" },
  ],
  servicos: [
    { href: "/painel/matches", nome: "Matches" },
    { href: "/painel/curtidas", nome: "O que você curtiu" },
    { href: "/painel/seguindo", nome: "Seguindo" },
  ],
};

/**
 * O modo de uma página que só existe num modo (candidatos é de quem contrata; currículo,
 * de quem procura). Abrir uma delas por um link (e-mail, aviso) troca o menu para lá.
 * Hoje, conversas e matches valem para todos: null.
 */
export function modoDaRota(caminho: string, tipo: string | null): ModoPainel | null {
  if (caminho.startsWith("/painel/candidatos") || caminho.startsWith("/painel/caixa")) return "contratar";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "servicos";
  if (caminho.startsWith("/painel/anuncios"))
    return tipo === "servico" ? "servicos" : tipo === "vaga" ? "contratar" : null;
  if (caminho.startsWith("/painel/curtidas") || caminho.startsWith("/painel/seguindo"))
    return tipo === "servico" ? null : "trabalhar";
  return null;
}

/** A seção aberta no menu (a mais específica que bate com o endereço). */
export function secaoAtiva(modo: ModoPainel, caminho: string, tipo: string | null): string | null {
  if (caminho === "/painel" || caminho === "/painel/") return "/painel";
  const secoes = [...SECOES[modo], ...OUTRAS[modo]];
  // a página de um anúncio (quem curtiu, quadro, editar) fica na lista de anúncios do modo
  if (caminho.startsWith("/painel/anuncio/")) {
    return SECOES[modo].find((s) => s.href.startsWith("/painel/anuncios"))?.href ?? null;
  }
  let melhor: string | null = null;
  for (const s of secoes) {
    const [base, busca] = s.href.split("?");
    if (!caminho.startsWith(base) || base === "/painel") continue;
    const tipoDaSecao = busca ? new URLSearchParams(busca).get("tipo") : null;
    if (tipoDaSecao && tipo && tipoDaSecao !== tipo) continue;
    if (!melhor || base.length > melhor.split("?")[0].length) melhor = s.href;
  }
  return melhor;
}
