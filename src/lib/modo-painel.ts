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

/** Os modos numa ordem só (a do menu e a do perfil), sem repetir e sem valor estranho. */
export function lerModos(valores: readonly (string | null | undefined)[] | null | undefined): ModoPainel[] {
  const lista = new Set(valores ?? []);
  return MODOS.map((m) => m.valor).filter((m) => lista.has(m));
}

/**
 * O que a conta pode marcar em "O que você quer fazer no Publike?": procurar trabalho é só de
 * pessoa (comércio, empresa e agência contratam e podem oferecer serviços).
 */
export function modosDoTipo(tipoConta: string | null | undefined): ModoPainel[] {
  return tipoConta && tipoConta !== "pessoa" ? ["servicos", "contratar"] : ["trabalhar", "servicos", "contratar"];
}

/**
 * O que a pessoa faz, numa linha, pelo que marcou: "Product Manager · procura trabalho · presta
 * serviços". `titulo`: o do currículo (só com "Procurar trabalho").
 */
export function textoDoQueFaz(modos: readonly ModoPainel[], titulo?: string | null) {
  const partes = [
    modos.includes("trabalhar") && (titulo ? `${titulo} · procura trabalho` : "procura trabalho"),
    modos.includes("servicos") && "presta serviços",
    modos.includes("contratar") && "contrata",
  ].filter((t): t is string => Boolean(t));
  const texto = partes.join(" · ");
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

/** O modo de quem ainda não escolheu: pelo tipo de conta e pelo que disse que quer fazer. */
export function modoPadrao(tipoConta: string | null | undefined, intencao: Intencao | null): ModoPainel {
  if ((tipoConta && tipoConta !== "pessoa") || intencao === "contratar_pessoa") return "contratar";
  if (intencao === "oferecer_servico") return "servicos";
  return "trabalhar";
}

/**
 * As páginas das Mensagens, um lugar só para falar com as pessoas: as conversas (a aba padrão), os
 * matches e as conexões. Acendem as Mensagens na barra de baixo, no topo e no menu do painel.
 */
export const PAGINAS_DE_MENSAGENS = ["/painel/conversas", "/painel/matches", "/painel/conexoes"];

/** Contadores que aparecem nas seções do menu (os do caminho da vaga só no modo Contratar). */
export type Contadores = {
  responder: number;
  pedidos: number;
  /** as mensagens novas e os pedidos de conexão para responder (as Mensagens juntam os dois) */
  mensagens: number;
  /** quem viu o perfil desde a última vez que a conta abriu "Quem viu seu perfil" */
  visitas?: number;
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
    | "entrevistas"
    | "visitas"
    | "testes"
    | "copiloto";
  contador?: keyof Contadores;
  /** como o número aparece: "pilula" (pede ação, em ink), "pronto" (para o cliente, em terra) ou texto discreto */
  jeito?: "pilula" | "pronto" | "texto";
  /** o número do passo no caminho da vaga */
  passo?: number;
  /** o texto ao lado do número ("no ar") */
  sufixo?: string;
  /** recurso pago (Copiloto e Testes Publike), com 15 dias grátis: ganha a pílula "15 dias grátis" */
  cortesia?: boolean;
};

/** Um grupo de seções no menu (sem nome: o primeiro, com Hoje). `caminho`: os passos numerados. */
export type GrupoMenu = {
  nome: string | null;
  caminho?: boolean;
  secoes: Secao[];
  /** com mais de uma atividade: o nome dela em cima do primeiro grupo dela ("Contratar") */
  atividade?: string;
};

/** As Mensagens (as conversas, os matches e as conexões), com as mensagens novas e os pedidos de conexão. */
const MENSAGENS: Secao = { href: "/painel/conversas", nome: "Mensagens", icone: "conversas", contador: "mensagens" };

export const SECOES: Record<ModoPainel, Secao[]> = {
  contratar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/caixa", nome: "Candidatos", icone: "caixa", contador: "responder" },
    { href: "/painel/anuncios?tipo=vaga", nome: "Vagas", icone: "vagas" },
    { href: "/talentos", nome: "Talentos", icone: "talentos" },
    MENSAGENS,
    { href: "/painel/visitas", nome: "Quem viu seu perfil", icone: "visitas", contador: "visitas" },
  ],
  trabalhar: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/curtidas?tipo=vaga", nome: "Candidaturas", icone: "curtidas" },
    MENSAGENS,
    // quem procura trabalho também se conecta (gente e empresas perto): à vista, fora das Mensagens
    { href: "/painel/conexoes", nome: "Conexões", icone: "conexoes" },
    { href: "/painel/visitas", nome: "Quem viu seu perfil", icone: "visitas", contador: "visitas" },
    { href: "/painel/seguindo", nome: "Avisos e seguindo", icone: "avisos" },
    { href: "/perfil/curriculo", nome: "Currículo", icone: "curriculo" },
  ],
  servicos: [
    { href: "/painel", nome: "Hoje", icone: "hoje" },
    { href: "/painel/anuncios?tipo=servico", nome: "Pedidos", icone: "pedidos", contador: "pedidos" },
    { href: "/painel/servicos", nome: "Vitrine", icone: "vitrine" },
    { href: "/painel/avaliacoes", nome: "Avaliações", icone: "avaliacoes" },
    MENSAGENS,
    { href: "/painel/visitas", nome: "Quem viu seu perfil", icone: "visitas", contador: "visitas" },
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
/** O que muda o menu de uma conta além do tipo: se a conta já tem o Copiloto (recurso pago). */
export type ExtrasDoMenu = { copiloto?: boolean };

export function gruposDoModo(
  modo: ModoPainel,
  tipoConta: string | null | undefined,
  extras: ExtrasDoMenu = {},
): GrupoMenu[] {
  if (modo !== "contratar") return [{ nome: null, secoes: SECOES[modo] }];
  const agencia = tipoConta === "agencia";
  const caminho: Secao[] = agencia
    ? [
        { href: "/painel/clientes", nome: "Clientes", icone: "clientes", contador: "clientes", jeito: "texto" },
        {
          href: "/painel/anuncios?tipo=vaga",
          nome: "Vagas",
          icone: "vagas",
          contador: "vagasNoAr",
          jeito: "texto",
          sufixo: "no ar",
        },
        { href: "/painel/caixa", nome: "Candidatos", icone: "caixa", contador: "responder", jeito: "pilula" },
        {
          href: "/painel/finalistas",
          nome: "Para o cliente",
          icone: "finalistas",
          contador: "prontos",
          jeito: "pronto",
        },
        {
          href: "/painel/contratados",
          nome: "Contratados",
          icone: "contratados",
          contador: "contratados",
          jeito: "texto",
        },
      ]
    : [
        {
          href: "/painel/anuncios?tipo=vaga",
          nome: "Vagas",
          icone: "vagas",
          contador: "vagasNoAr",
          jeito: "texto",
          sufixo: "no ar",
        },
        // Entrevista e Contratados são etapas de Candidatos (parte 2 do claude/plano-painel-simples.md)
        { href: "/painel/caixa", nome: "Candidatos", icone: "caixa", contador: "responder", jeito: "pilula" },
      ];
  // o menu só navega (29/10/2026, claude/plano-painel-simples.md): sem os números de passo; o caminho da vaga
  // fica na horizontal, na Hoje e nas páginas de candidatos
  return [
    {
      nome: null,
      secoes: [{ href: "/painel", nome: "Hoje", icone: "hoje" }, ...caminho, { ...MENSAGENS, jeito: "pilula" }],
    },
    {
      nome: "Achar gente",
      secoes: [
        // sempre no menu: sem o recurso, a página mostra a oferta dos 15 dias grátis (o selo some quando já tem)
        { href: "/painel/copiloto", nome: "Copiloto", icone: "copiloto", cortesia: !extras.copiloto },
        { href: "/talentos", nome: "Talentos", icone: "talentos" },
      ],
    },
    {
      nome: agencia ? "Agência" : "Sua empresa",
      secoes: [
        { href: "/painel/links", nome: "Links para divulgar", icone: "links" },
        {
          href: "/painel/visitas",
          nome: "Quem viu seu perfil",
          icone: "visitas",
          contador: "visitas",
          jeito: "pilula",
        },
        { href: "/painel/testes", nome: "Testes Publike", icone: "testes", cortesia: true },
        ...(agencia ? [EQUIPE] : []),
      ],
    },
  ];
}

/** O resto do painel, no fim do menu (o que não é do modo aberto). Os matches ficam nas Mensagens. */
export const OUTRAS: Record<ModoPainel, { href: string; nome: string }[]> = {
  contratar: [
    { href: "/painel/candidatos", nome: "Lista de candidatos e planilha" },
    { href: "/painel/curtidas", nome: "O que você curtiu" },
    { href: "/painel/seguindo", nome: "Seguindo" },
  ],
  trabalhar: [
    { href: "/painel/curtidas?tipo=servico", nome: "Serviços que você pediu" },
    { href: "/painel/anuncios", nome: "Meus anúncios" },
  ],
  servicos: [
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
    caminho.startsWith("/painel/clientes") ||
    caminho.startsWith("/painel/equipe") ||
    caminho.startsWith("/painel/finalistas") ||
    caminho.startsWith("/painel/contratados") ||
    caminho.startsWith("/painel/links") ||
    caminho.startsWith("/painel/testes") ||
    caminho.startsWith("/painel/copiloto")
  )
    return "contratar";
  if (caminho.startsWith("/painel/servicos") || caminho.startsWith("/painel/avaliacoes")) return "servicos";
  if (caminho.startsWith("/painel/anuncios"))
    return tipo === "servico" ? "servicos" : tipo === "vaga" ? "contratar" : null;
  if (caminho.startsWith("/painel/curtidas") || caminho.startsWith("/painel/seguindo"))
    return tipo === "servico" ? null : "trabalhar";
  return null;
}

/** O que vale para todas as atividades: fica no alto do menu, uma vez só, quando a conta faz mais de uma. */
const COMUNS = ["/painel", "/painel/conversas", "/painel/visitas"];

/**
 * Os grupos do menu para as atividades da conta (a principal primeiro), sem troca de modo: com uma
 * atividade, o menu dela, como sempre; com mais, o comum no alto (Hoje, Mensagens, Quem viu seu
 * perfil) e o grupo de cada atividade com o nome dela em cima ("Contratar", "Trabalhar", "Serviços").
 */
export function gruposDaConta(
  atividades: ModoPainel[],
  tipoConta: string | null | undefined,
  extras: ExtrasDoMenu = {},
): GrupoMenu[] {
  if (atividades.length <= 1) return gruposDoModo(atividades[0] ?? "trabalhar", tipoConta, extras);
  const todas = atividades.flatMap((m) => gruposDoModo(m, tipoConta, extras).flatMap((g) => g.secoes));
  const comuns = COMUNS.map((href) => todas.find((s) => s.href === href)).filter((s): s is Secao => Boolean(s));
  const grupos: GrupoMenu[] = [{ nome: null, secoes: comuns }];
  for (const m of atividades) {
    const nome = MODOS.find((x) => x.valor === m)?.nome ?? m;
    let primeiro = true;
    for (const g of gruposDoModo(m, tipoConta, extras)) {
      const secoes = g.secoes.filter((s) => !COMUNS.includes(s.href));
      if (!secoes.length) continue;
      grupos.push({ ...g, atividade: primeiro ? nome : undefined, secoes });
      primeiro = false;
    }
  }
  return grupos;
}

/** O "Mais" do menu: o resto do painel das atividades da conta, sem repetir o que já está nos grupos. */
export function outrasDaConta(atividades: ModoPainel[], grupos: GrupoMenu[]): { href: string; nome: string }[] {
  const nosGrupos = new Set(grupos.flatMap((g) => g.secoes.map((s) => s.href)));
  const vistas = new Set<string>();
  // a lista com o filtro de cliente fica só para a agência; nas outras contas, Candidatos já tem tudo
  const agencia = nosGrupos.has("/painel/clientes");
  return atividades
    .flatMap((m) => OUTRAS[m])
    .filter((o) => agencia || o.href !== "/painel/candidatos")
    .filter((o) => !nosGrupos.has(o.href) && !vistas.has(o.href) && vistas.add(o.href));
}

/** A seção aberta no menu (a mais específica que bate com o endereço). */
export function secaoAtiva(
  grupos: GrupoMenu[],
  outras: { href: string; nome: string }[],
  caminho: string,
  tipo: string | null,
): string | null {
  if (caminho === "/painel" || caminho === "/painel/") return "/painel";
  const secoes = [...grupos.flatMap((g) => g.secoes), ...outras];
  // as Mensagens juntam as conversas, os matches e as conexões
  if (PAGINAS_DE_MENSAGENS.some((p) => caminho.startsWith(p))) {
    // com as Conexões no menu (quem procura trabalho), a página delas acende as Conexões
    const conexoes = caminho.startsWith("/painel/conexoes") && secoes.find((s) => s.href === "/painel/conexoes");
    if (conexoes) return conexoes.href;
    return secoes.find((s) => s.href === MENSAGENS.href)?.href ?? null;
  }
  // a página de um anúncio (quem curtiu, quadro, editar) fica na lista de anúncios do modo
  if (caminho.startsWith("/painel/anuncio/")) {
    return secoes.find((s) => s.href.startsWith("/painel/anuncios"))?.href ?? null;
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
