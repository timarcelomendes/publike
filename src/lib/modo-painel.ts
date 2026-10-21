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

/** Contadores que aparecem nas seções do menu (os do caminho da vaga só no modo Contratar). */
export type Contadores = {
  responder: number;
  pedidos: number;
  mensagens: number;
  conexoes: number;
  clientes?: number;
  vagasNoAr?: number;
  prontos?: number;
  entrevistas?: number;
  contratados?: number;
};

export type Secao = {
  href: string;
  nome: string;
  icone:
    | "hoje"
    | "caixa"
    | "talentos"
    | "candidatos"
    | "vagas"
    | "conversas"
    | "curtidas"
    | "avisos"
    | "curriculo"
    | "pedidos"
    | "vitrine"
    | "avaliacoes"
    | "clientes"
    | "equipe"
    | "conexoes"
    | "finalistas"
    | "contratados"
    | "links"
    | "entrevistas";
  contador?: keyof Contadores;
  /** como o número aparece: "pilula" (pede ação, em ink), "pronto" (para o cliente, em terra) ou texto discreto */
  jeito?: "pilula" | "pronto" | "texto";
  /** o número do passo no caminho da vaga */
  passo?: number;
  /** o texto ao lado do número ("no ar") */
  sufixo?: string;
};

/** Um grupo de seções no menu (sem nome: o primeiro, com Hoje). `caminho`: os passos numerados. */
export type GrupoMenu = { nome: string | null; caminho?: boolean; secoes: Secao[] };

export const SECOES: Record<ModoPainel, Secao[]> = {
  contratar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/caixa", nome: "Caixa de entrada", icone: "caixa", contador: "responder" },
    { href: "/painel/anuncios?tipo=vaga", nome: "Minhas vagas", icone: "vagas" },
    { href: "/painel/talentos", nome: "Talentos", icone: "talentos" },
    { href: "/painel/conexoes", nome: "Conexões", icone: "conexoes", contador: "conexoes" },
    { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens" },
  ],
  trabalhar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/curtidas?tipo=vaga", nome: "Candidaturas", icone: "curtidas" },
    { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens" },
    { href: "/painel/conexoes", nome: "Conexões", icone: "conexoes", contador: "conexoes" },
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

/** Agência de emprego tem mais duas seções em Contratar: os clientes, logo depois das vagas, e a equipe. */
const CLIENTES: Secao = { href: "/painel/clientes", nome: "Clientes", icone: "clientes" };
const EQUIPE: Secao = { href: "/painel/equipe", nome: "Equipe", icone: "equipe" };

/** As seções do modo para esta conta (a agência ganha "Clientes" e "Equipe"). */
export function secoesDoModo(modo: ModoPainel, tipoConta: string | null | undefined): Secao[] {
  const secoes = SECOES[modo];
  if (modo !== "contratar" || tipoConta !== "agencia") return secoes;
  const depoisDe = secoes.findIndex((s) => s.icone === "vagas") + 1;
  return [...secoes.slice(0, depoisDe), CLIENTES, ...secoes.slice(depoisDe), EQUIPE];
}

/**
 * Os grupos do menu. Em Contratar, o caminho da vaga, sempre na mesma ordem: a agência tem
 * Clientes e Para o cliente; comércio e empresa, Entrevistas. Os outros modos, um grupo só.
 */
export function gruposDoModo(modo: ModoPainel, tipoConta: string | null | undefined): GrupoMenu[] {
  if (modo !== "contratar") return [{ nome: null, secoes: SECOES[modo] }];
  const agencia = tipoConta === "agencia";
  const caminho: Omit<Secao, "passo">[] = agencia
    ? [
        { href: "/painel/clientes", nome: "Clientes", icone: "clientes", contador: "clientes", jeito: "texto" },
        { href: "/painel/anuncios?tipo=vaga", nome: "Vagas", icone: "vagas", contador: "vagasNoAr", jeito: "texto", sufixo: "no ar" },
        { href: "/painel/caixa", nome: "Candidatos", icone: "caixa", contador: "responder", jeito: "pilula" },
        { href: "/painel/finalistas", nome: "Para o cliente", icone: "finalistas", contador: "prontos", jeito: "pronto" },
        { href: "/painel/contratados", nome: "Contratados", icone: "contratados", contador: "contratados", jeito: "texto" },
      ]
    : [
        { href: "/painel/anuncios?tipo=vaga", nome: "Vagas", icone: "vagas", contador: "vagasNoAr", jeito: "texto", sufixo: "no ar" },
        { href: "/painel/caixa", nome: "Candidatos", icone: "caixa", contador: "responder", jeito: "pilula" },
        { href: "/painel/caixa?aba=entrevistas", nome: "Entrevistas", icone: "entrevistas", contador: "entrevistas", jeito: "texto" },
        { href: "/painel/contratados", nome: "Contratados", icone: "contratados", contador: "contratados", jeito: "texto" },
      ];
  return [
    { nome: null, secoes: [{ href: "/painel", nome: "Hoje", icone: "hoje" }] },
    { nome: "O caminho da vaga", caminho: true, secoes: caminho.map((s, n) => ({ ...s, passo: n + 1 })) },
    {
      nome: "Achar gente",
      secoes: [
        { href: "/painel/talentos", nome: "Talentos", icone: "talentos" },
        { href: "/painel/conexoes", nome: "Conexões", icone: "conexoes", contador: "conexoes", jeito: "pilula" },
        { href: "/painel/conversas", nome: "Conversas", icone: "conversas", contador: "mensagens", jeito: "pilula" },
      ],
    },
    {
      nome: agencia ? "Agência" : "Sua empresa",
      secoes: [
        { href: "/painel/links", nome: "Links para divulgar", icone: "links" },
        ...(agencia ? [EQUIPE] : []),
      ],
    },
  ];
}

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
  if (
    caminho.startsWith("/painel/candidatos") ||
    caminho.startsWith("/painel/caixa") ||
    caminho.startsWith("/painel/talentos") ||
    caminho.startsWith("/painel/clientes") ||
    caminho.startsWith("/painel/equipe") ||
    caminho.startsWith("/painel/finalistas") ||
    caminho.startsWith("/painel/contratados") ||
    caminho.startsWith("/painel/links")
  )
    return "contratar";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "servicos";
  if (caminho.startsWith("/painel/anuncios"))
    return tipo === "servico" ? "servicos" : tipo === "vaga" ? "contratar" : null;
  if (caminho.startsWith("/painel/curtidas") || caminho.startsWith("/painel/seguindo"))
    return tipo === "servico" ? null : "trabalhar";
  return null;
}

/** A seção aberta no menu (a mais específica que bate com o endereço). */
export function secaoAtiva(
  modo: ModoPainel,
  caminho: string,
  tipo: string | null,
  tipoConta: string | null = null,
  aba: string | null = null,
): string | null {
  if (caminho === "/painel" || caminho === "/painel/") return "/painel";
  const secoes = [...gruposDoModo(modo, tipoConta).flatMap((g) => g.secoes), ...OUTRAS[modo]];
  // a caixa na aba de entrevistas é o passo Entrevistas (comércio e empresa)
  if (caminho.startsWith("/painel/caixa") && aba === "entrevistas") {
    const entrevistas = secoes.find((s) => s.href === "/painel/caixa?aba=entrevistas");
    if (entrevistas) return entrevistas.href;
  }
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
