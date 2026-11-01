// As Automações personalizadas: as regras que a empresa monta (claude/plano-regras-personalizadas.md; migração
// 20270115120000). Quando [algo acontece], se [a pessoa atende isto], então [o Publike faz aquilo], em [esta
// vaga, todas ou as vagas de um cliente]. Aqui: os tipos, os nomes, a frase, a conferência das condições (a mesma no
// servidor que age e na prévia da tela) e os conflitos entre regras. O banco confere de novo ao salvar e ao agir.

import type { FormatoEntrevista } from "./recrutamento";
import type { Pergunta, Respostas } from "./vaga-extra";

export type EtapaDaRegra = "analise" | "entrevista" | "contratado" | "nao_seguiu";
export type EtapaParada = "novos" | "analise" | "entrevista";

export const NOME_ETAPA_DA_REGRA: Record<EtapaDaRegra, string> = {
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratados",
  nao_seguiu: "Não seguiu",
};
export const NOME_ETAPA_PARADA: Record<EtapaParada, string> = {
  novos: "Novos",
  analise: "Em análise",
  entrevista: "Entrevista",
};

export type Gatilho =
  | { tipo: "candidatou" }
  | { tipo: "entrou_etapa"; etapa: EtapaDaRegra }
  | { tipo: "parado"; etapa: EtapaParada; dias: number }
  | { tipo: "triagem" }
  | { tipo: "teste_feito" }
  | { tipo: "teste_vencido" }
  | { tipo: "video_enviado" }
  | { tipo: "entrevista_passou"; horas: number };
export type TipoGatilho = Gatilho["tipo"];

/** O que dispara a regra, na ordem da lista da tela. */
export const GATILHOS: { tipo: TipoGatilho; nome: string }[] = [
  { tipo: "candidatou", nome: "alguém se candidatar" },
  { tipo: "entrou_etapa", nome: "alguém entrar numa etapa" },
  { tipo: "parado", nome: "alguém ficar parado numa etapa" },
  { tipo: "triagem", nome: "a Triagem com IA ler o currículo" },
  { tipo: "teste_feito", nome: "a pessoa terminar o Teste Prático" },
  { tipo: "teste_vencido", nome: "o prazo do teste acabar sem resposta" },
  { tipo: "video_enviado", nome: "a pessoa mandar a entrevista em vídeo" },
  { tipo: "entrevista_passou", nome: "a entrevista já tiver acontecido" },
];

export type Condicao =
  | { campo: "pergunta"; pergunta: string; op: "em" | "fora"; valores: string[] }
  | { campo: "pergunta"; pergunta: string; op: "maior_igual" | "menor_igual"; valor: number }
  | { campo: "teste" | "combina"; op: "maior_igual" | "menor"; valor: number }
  | { campo: "distancia"; op: "ate" | "mais_de"; valor: number }
  | { campo: "triagem"; op: "atende" | "nao_atende" }
  | { campo: "curriculo"; op: "tem" | "nao_tem" }
  | { campo: "origem"; op: "publike" | "chamado" };
export type CampoCondicao = Condicao["campo"];

/** As condições que a tela oferece. `ia`: a Triagem com IA, que nunca dispensa ninguém. */
export const CAMPOS: { campo: CampoCondicao; nome: string; ia?: boolean }[] = [
  { campo: "pergunta", nome: "a resposta a uma pergunta da vaga" },
  { campo: "distancia", nome: "a distância até a vaga" },
  { campo: "combina", nome: "quanto combina com a vaga" },
  { campo: "teste", nome: "a nota do Teste Prático" },
  { campo: "triagem", nome: "o que a Triagem com IA diz", ia: true },
  { campo: "curriculo", nome: "se tem currículo" },
  { campo: "origem", nome: "de onde veio" },
];

export type Acao =
  | { tipo: "mover"; etapa: EtapaDaRegra }
  | { tipo: "aceitar" }
  | { tipo: "dispensar" }
  | { tipo: "mensagem"; texto: string; esperar: "agora" | "1h" | "amanha" }
  | { tipo: "teste"; modelo: string }
  | { tipo: "video" }
  | { tipo: "horarios"; formato: FormatoEntrevista; local: string | null; duracao: number }
  | { tipo: "avisar"; quem: string };
export type TipoAcao = Acao["tipo"];

export const ACOES: { tipo: TipoAcao; nome: string }[] = [
  { tipo: "mover", nome: "mover para uma etapa" },
  { tipo: "aceitar", nome: "aceitar (o contato fica liberado)" },
  { tipo: "dispensar", nome: "dispensar, com o retorno" },
  { tipo: "mensagem", nome: "mandar uma mensagem" },
  { tipo: "teste", nome: "pedir um Teste Prático" },
  { tipo: "video", nome: "pedir a entrevista em vídeo" },
  { tipo: "horarios", nome: "oferecer os seus horários livres" },
  { tipo: "avisar", nome: "avisar você ou alguém da equipe" },
];

export const ESPERAS = { agora: "na hora", "1h": "1 hora depois", amanha: "no dia seguinte, às 9h" } as const;

export type ValeEm = "vaga" | "todas" | "cliente";

/** A regra como a tela monta e manda salvar. */
export type RegraMontada = {
  nome: string;
  gatilho: Gatilho;
  condicoes: Condicao[];
  acoes: Acao[];
  vale_em: ValeEm;
  anuncio_id?: string | null;
  cliente_id?: string | null;
  modelo?: string | null;
};

export type Regra = RegraMontada & { id: string; ligada: boolean; ligada_em: string | null; criada_em: string };

export const LIMITES_DA_REGRA = { condicoes: 5, acoes: 4, ligadas: 30 };

// ------------------------------------------------------------------------------------------------ ler

const texto = (x: unknown) => (typeof x === "string" ? x : "");
const numero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x));

export function lerGatilho(x: unknown): Gatilho | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  switch (o.tipo) {
    case "candidatou":
    case "triagem":
    case "teste_feito":
    case "teste_vencido":
    case "video_enviado":
      return { tipo: o.tipo };
    case "entrou_etapa":
      return typeof o.etapa === "string" && o.etapa in NOME_ETAPA_DA_REGRA
        ? { tipo: "entrou_etapa", etapa: o.etapa as EtapaDaRegra }
        : null;
    case "parado":
      return typeof o.etapa === "string" && o.etapa in NOME_ETAPA_PARADA
        ? { tipo: "parado", etapa: o.etapa as EtapaParada, dias: numero(o.dias) || 3 }
        : null;
    case "entrevista_passou":
      return { tipo: "entrevista_passou", horas: numero(o.horas) || 24 };
    default:
      return null;
  }
}

export function lerCondicoes(x: unknown): Condicao[] {
  return (Array.isArray(x) ? x : []).flatMap((c): Condicao[] => {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    if (o.campo === "pergunta" && (o.op === "em" || o.op === "fora"))
      return [
        {
          campo: "pergunta",
          pergunta: texto(o.pergunta),
          op: o.op,
          valores: (Array.isArray(o.valores) ? o.valores : []).map(String),
        },
      ];
    if (o.campo === "pergunta" && (o.op === "maior_igual" || o.op === "menor_igual"))
      return [{ campo: "pergunta", pergunta: texto(o.pergunta), op: o.op, valor: numero(o.valor) }];
    if ((o.campo === "teste" || o.campo === "combina") && (o.op === "maior_igual" || o.op === "menor"))
      return [{ campo: o.campo, op: o.op, valor: numero(o.valor) }];
    if (o.campo === "distancia" && (o.op === "ate" || o.op === "mais_de"))
      return [{ campo: "distancia", op: o.op, valor: numero(o.valor) }];
    if (o.campo === "triagem" && (o.op === "atende" || o.op === "nao_atende")) return [{ campo: "triagem", op: o.op }];
    if (o.campo === "curriculo" && (o.op === "tem" || o.op === "nao_tem")) return [{ campo: "curriculo", op: o.op }];
    if (o.campo === "origem" && (o.op === "publike" || o.op === "chamado")) return [{ campo: "origem", op: o.op }];
    return [];
  });
}

export function lerAcoes(x: unknown): Acao[] {
  return (Array.isArray(x) ? x : []).flatMap((a): Acao[] => {
    const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    switch (o.tipo) {
      case "mover":
        return typeof o.etapa === "string" && o.etapa in NOME_ETAPA_DA_REGRA
          ? [{ tipo: "mover", etapa: o.etapa as EtapaDaRegra }]
          : [];
      case "aceitar":
      case "dispensar":
      case "video":
        return [{ tipo: o.tipo }];
      case "mensagem":
        return [
          {
            tipo: "mensagem",
            texto: texto(o.texto),
            esperar: o.esperar === "1h" || o.esperar === "amanha" ? o.esperar : "agora",
          },
        ];
      case "teste":
        return [{ tipo: "teste", modelo: texto(o.modelo) }];
      case "horarios":
        return [
          {
            tipo: "horarios",
            formato: (texto(o.formato) || "presencial") as FormatoEntrevista,
            local: texto(o.local) || null,
            duracao: numero(o.duracao) || 30,
          },
        ];
      case "avisar":
        return [{ tipo: "avisar", quem: texto(o.quem) || "eu" }];
      default:
        return [];
    }
  });
}

export function lerRegra(x: unknown): Regra | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const gatilho = lerGatilho(o.gatilho);
  if (!gatilho || typeof o.id !== "string") return null;
  return {
    id: o.id,
    nome: texto(o.nome),
    ligada: o.ligada === true,
    ligada_em: typeof o.ligada_em === "string" ? o.ligada_em : null,
    criada_em: texto(o.criada_em),
    gatilho,
    condicoes: lerCondicoes(o.condicoes),
    acoes: lerAcoes(o.acoes),
    vale_em: o.vale_em === "todas" || o.vale_em === "cliente" ? o.vale_em : "vaga",
    anuncio_id: typeof o.anuncio_id === "string" ? o.anuncio_id : null,
    cliente_id: typeof o.cliente_id === "string" ? o.cliente_id : null,
    modelo: typeof o.modelo === "string" ? o.modelo : null,
  };
}

// ------------------------------------------------------------------------------------------------ a frase

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function textoDoGatilho(g: Gatilho): string {
  switch (g.tipo) {
    case "candidatou":
      return "Quando alguém se candidatar";
    case "entrou_etapa":
      return `Quando alguém entrar em ${NOME_ETAPA_DA_REGRA[g.etapa]}`;
    case "parado":
      return `Quando alguém ficar ${plural(g.dias, "dia", "dias")} parado em ${NOME_ETAPA_PARADA[g.etapa]}`;
    case "triagem":
      return "Quando a Triagem com IA ler o currículo";
    case "teste_feito":
      return "Quando a pessoa terminar o Teste Prático";
    case "teste_vencido":
      return "Quando o prazo do teste acabar sem resposta";
    case "video_enviado":
      return "Quando a pessoa mandar a entrevista em vídeo";
    case "entrevista_passou":
      return `${plural(g.horas, "hora", "horas")} depois da entrevista`;
  }
}

/** Os valores de uma pergunta sim ou não aparecem como "Sim" e "Não". */
export function nomeDoValor(v: string) {
  return v === "sim" ? "Sim" : v === "nao" ? "Não" : v;
}

export function textoDaCondicao(c: Condicao): string {
  switch (c.campo) {
    case "pergunta":
      if (c.op === "em") return `respondeu “${c.pergunta}”: ${c.valores.map(nomeDoValor).join(" ou ")}`;
      if (c.op === "fora") return `não respondeu “${c.pergunta}”: ${c.valores.map(nomeDoValor).join(" nem ")}`;
      return `respondeu “${c.pergunta}” com ${(c as { valor: number }).valor} ou ${c.op === "maior_igual" ? "mais" : "menos"}`;
    case "teste":
      return c.op === "maior_igual" ? `acertou ${c.valor}% ou mais no teste` : `acertou menos de ${c.valor}% no teste`;
    case "combina":
      return c.op === "maior_igual"
        ? `combina ${c.valor}% ou mais com a vaga`
        : `combina menos de ${c.valor}% com a vaga`;
    case "distancia":
      return c.op === "ate" ? `mora a até ${c.valor} km da vaga` : `mora a mais de ${c.valor} km da vaga`;
    case "triagem":
      return c.op === "atende"
        ? "a Triagem com IA diz que atende os obrigatórios"
        : "a Triagem com IA diz que não atende um obrigatório";
    case "curriculo":
      return c.op === "tem" ? "tem currículo" : "não tem currículo";
    case "origem":
      return c.op === "publike" ? "achou a vaga no Publike" : "foi chamado por você";
  }
}

export function textoDaAcao(a: Acao, nomes: { testes?: Map<string, string>; equipe?: Map<string, string> } = {}) {
  switch (a.tipo) {
    case "mover":
      return a.etapa === "nao_seguiu"
        ? "move para Não seguiu, com o retorno"
        : `move para ${NOME_ETAPA_DA_REGRA[a.etapa]}`;
    case "aceitar":
      return "aceita";
    case "dispensar":
      return "dispensa, com o retorno";
    case "mensagem":
      return a.esperar === "agora" ? "manda uma mensagem" : `manda uma mensagem ${ESPERAS[a.esperar]}`;
    case "teste":
      return `pede o teste ${nomes.testes?.get(a.modelo) ? `“${nomes.testes.get(a.modelo)}”` : "escolhido"}`;
    case "video":
      return "pede a entrevista em vídeo";
    case "horarios":
      return "oferece os seus horários livres";
    case "avisar":
      return a.quem === "eu" ? "avisa você" : `avisa ${nomes.equipe?.get(a.quem) ?? "alguém da equipe"}`;
  }
}

function juntar(partes: string[]) {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** A regra numa frase: "Quando alguém se candidatar, se mora a até 5 km, então move para Em análise." */
export function fraseDaRegra(r: Pick<RegraMontada, "gatilho" | "condicoes" | "acoes">, nomes = {}) {
  const se = r.condicoes.length ? `, se ${juntar(r.condicoes.map(textoDaCondicao))}` : "";
  const entao = r.acoes.length ? `, então ${juntar(r.acoes.map((a) => textoDaAcao(a, nomes)))}` : "";
  return `${textoDoGatilho(r.gatilho)}${se}${entao}.`;
}

// ------------------------------------------------------------------------------------------------ conferir

/** Para comparar respostas e nomes de pergunta sem ligar para acento, maiúscula e espaços. */
export function limpo(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** O que a regra precisa saber da pessoa (no servidor que age e na prévia da tela). */
export type ContextoDaPessoa = {
  perguntas: Pick<Pergunta, "id" | "nome" | "tipo">[];
  respostas: Respostas;
  /** a melhor nota do teste da vaga, de 0 a 100 */
  teste: number | null;
  /** o % que combina com a vaga (o mesmo da ficha) */
  combina: number | null;
  /** quantos km entre onde a pessoa mora e a vaga (null: não dá para saber) */
  km: number | null;
  /** a Triagem com IA: atende os obrigatórios (null: não leu) */
  triagem: boolean | null;
  temCurriculo: boolean;
  origem: "publike" | "chamado";
};

/** Uma condição vale? O que não dá para saber (sem resposta, sem nota, sem endereço) não vale. */
export function confereCondicao(c: Condicao, p: ContextoDaPessoa): boolean {
  switch (c.campo) {
    case "pergunta": {
      const q = p.perguntas.find((x) => limpo(x.nome) === limpo(c.pergunta));
      const v = q ? p.respostas[q.id] : undefined;
      if (v === undefined || v === null || String(v).trim() === "") return false;
      if (c.op === "em") return c.valores.some((x) => limpo(x) === limpo(String(v)));
      if (c.op === "fora") return !c.valores.some((x) => limpo(x) === limpo(String(v)));
      const n = Number(String(v).replace(",", "."));
      const limite = (c as { valor: number }).valor;
      if (!Number.isFinite(n)) return false;
      return c.op === "maior_igual" ? n >= limite : n <= limite;
    }
    case "teste":
    case "combina": {
      const n = c.campo === "teste" ? p.teste : p.combina;
      if (n === null) return false;
      return c.op === "maior_igual" ? n >= c.valor : n < c.valor;
    }
    case "distancia":
      if (p.km === null) return false;
      return c.op === "ate" ? p.km <= c.valor : p.km > c.valor;
    case "triagem":
      if (p.triagem === null) return false;
      return c.op === "atende" ? p.triagem : !p.triagem;
    case "curriculo":
      return c.op === "tem" ? p.temCurriculo : !p.temCurriculo;
    case "origem":
      return p.origem === c.op;
  }
}

export function confereRegra(r: Pick<RegraMontada, "condicoes">, p: ContextoDaPessoa) {
  return r.condicoes.every((c) => confereCondicao(c, p));
}

export const dispensa = (a: Acao) => a.tipo === "dispensar" || (a.tipo === "mover" && a.etapa === "nao_seguiu");
export const regraDispensa = (r: Pick<RegraMontada, "acoes">) => r.acoes.some(dispensa);

/** O porquê da dispensa automática, para o retorno ("porque respondeu “Tem CNH?”: Não"). */
export function motivoDaDispensa(r: Pick<RegraMontada, "condicoes" | "gatilho">) {
  if (r.condicoes.length) return `porque ${juntar(r.condicoes.map(textoDaCondicao))}`.slice(0, 200);
  if (r.gatilho.tipo === "teste_vencido") return "porque o prazo do teste acabou sem resposta";
  if (r.gatilho.tipo === "parado") return "porque o processo ficou parado";
  return "";
}

const ORDEM_DA_ETAPA: Record<EtapaDaRegra, number> = { analise: 1, entrevista: 2, contratado: 3, nao_seguiu: 9 };

/**
 * Várias regras para a mesma pessoa no mesmo momento (como no Greenhouse): dispensar ganha de mover (e, depois de
 * dispensar, só os avisos para você saem); entre as que movem, vale a que leva mais adiante. Devolve, de cada regra,
 * os números (a partir de 1) das ações que valem. A regra sem ação que valha fica anotada assim mesmo (age uma vez).
 */
export function resolverConflitos<R extends Pick<RegraMontada, "acoes">>(
  regras: R[],
): { regra: R; indices: number[] }[] {
  const dispensadora = regras.findIndex(regraDispensa);
  if (dispensadora >= 0) {
    return regras.map((r, i) => ({
      regra: r,
      indices: r.acoes.flatMap((a, j) => (a.tipo === "avisar" || (i === dispensadora && dispensa(a)) ? [j + 1] : [])),
    }));
  }
  let melhor: { i: number; j: number; ordem: number } | null = null;
  regras.forEach((r, i) =>
    r.acoes.forEach((a, j) => {
      if (a.tipo === "mover" && (!melhor || ORDEM_DA_ETAPA[a.etapa] > melhor.ordem))
        melhor = { i, j, ordem: ORDEM_DA_ETAPA[a.etapa] };
    }),
  );
  const m = melhor as { i: number; j: number } | null;
  return regras.map((r, i) => ({
    regra: r,
    indices: r.acoes.flatMap((a, j) => (a.tipo === "mover" && !(m && m.i === i && m.j === j) ? [] : [j + 1])),
  }));
}

// ------------------------------------------------------------------------------------------------ os modelos

export type Modelo = {
  slug: string;
  nome: string;
  descricao: string;
  regra: (p: { perguntas: Pergunta[] }) => RegraMontada;
};

const primeiraSimNao = (perguntas: Pergunta[]) =>
  perguntas.find((q) => q.eliminatoria) ?? perguntas.find((q) => q.tipo === "sim_nao");

/** Os modelos para começar: cada um abre a tela já preenchida (a empresa ajusta e salva). */
export const MODELOS: Modelo[] = [
  {
    slug: "dispensar-pela-pergunta",
    nome: "Dispensar quem não tem o obrigatório",
    descricao: "Quem responde diferente do que a vaga pede sai com o retorno.",
    regra: ({ perguntas }) => {
      const q = primeiraSimNao(perguntas);
      const esperada = q?.esperada ?? "sim";
      return {
        nome: "Dispensar quem não tem o obrigatório",
        gatilho: { tipo: "candidatou" },
        condicoes: [{ campo: "pergunta", pergunta: q?.nome ?? "", op: "fora", valores: [esperada] }],
        acoes: [{ tipo: "dispensar" }],
        vale_em: "vaga",
      };
    },
  },
  {
    slug: "teste-antes-da-conversa",
    nome: "Teste antes da conversa",
    descricao: "Quem acerta 70% ou mais recebe os seus horários livres para a entrevista.",
    regra: () => ({
      nome: "Teste antes da conversa",
      gatilho: { tipo: "teste_feito" },
      condicoes: [{ campo: "teste", op: "maior_igual", valor: 70 }],
      acoes: [
        { tipo: "mover", etapa: "entrevista" },
        { tipo: "horarios", formato: "presencial", local: null, duracao: 30 },
      ],
      vale_em: "vaga",
    }),
  },
  {
    slug: "perto-primeiro",
    nome: "Perto primeiro",
    descricao: "Quem mora perto e combina com a vaga vai para Em análise, e você fica sabendo.",
    regra: () => ({
      nome: "Perto primeiro",
      gatilho: { tipo: "candidatou" },
      condicoes: [
        { campo: "distancia", op: "ate", valor: 5 },
        { campo: "combina", op: "maior_igual", valor: 70 },
      ],
      acoes: [
        { tipo: "mover", etapa: "analise" },
        { tipo: "avisar", quem: "eu" },
      ],
      vale_em: "vaga",
    }),
  },
  {
    slug: "triagem-adianta",
    nome: "A Triagem adianta",
    descricao: "Quem a Triagem com IA diz que atende os obrigatórios vai para Em análise.",
    regra: () => ({
      nome: "A Triagem adianta",
      gatilho: { tipo: "triagem" },
      condicoes: [{ campo: "triagem", op: "atende" }],
      acoes: [{ tipo: "mover", etapa: "analise" }],
      vale_em: "vaga",
    }),
  },
  {
    slug: "mensagem-da-etapa",
    nome: "A mensagem de cada etapa",
    descricao: "Quem chega em Entrevista recebe a sua mensagem na conversa.",
    regra: () => ({
      nome: "Mensagem da entrevista",
      gatilho: { tipo: "entrou_etapa", etapa: "entrevista" },
      condicoes: [],
      acoes: [
        {
          tipo: "mensagem",
          texto: "Oi, {nome}! Gostamos do seu perfil para {vaga}. Vamos marcar a sua entrevista? Abraço, {empresa}.",
          esperar: "agora",
        },
      ],
      vale_em: "vaga",
    }),
  },
  {
    slug: "seu-recado",
    nome: "O seu recado de boas-vindas",
    descricao: "Quem se candidata recebe o seu texto, do seu jeito.",
    regra: () => ({
      nome: "Recado de boas-vindas",
      gatilho: { tipo: "candidatou" },
      condicoes: [],
      acoes: [
        {
          tipo: "mensagem",
          texto: "Oi, {nome}! Aqui é {empresa}: recebemos a sua candidatura para {vaga}. Respondemos em até 3 dias.",
          esperar: "agora",
        },
      ],
      vale_em: "vaga",
    }),
  },
  {
    slug: "ninguem-esfria",
    nome: "Ninguém esfria",
    descricao: "Quem fica 3 dias parado em Em análise gera um aviso para você.",
    regra: () => ({
      nome: "Ninguém esfria",
      gatilho: { tipo: "parado", etapa: "analise", dias: 3 },
      condicoes: [],
      acoes: [{ tipo: "avisar", quem: "eu" }],
      vale_em: "vaga",
    }),
  },
  {
    slug: "retorno-sem-resposta",
    nome: "Retorno no seu prazo",
    descricao: "Quem fica sem resposta em Novos pelo prazo que você escolher recebe o retorno.",
    regra: () => ({
      nome: "Retorno no seu prazo",
      gatilho: { tipo: "parado", etapa: "novos", dias: 10 },
      condicoes: [],
      acoes: [{ tipo: "dispensar" }],
      vale_em: "vaga",
    }),
  },
  {
    slug: "decidir-depois-da-entrevista",
    nome: "Decidir depois da entrevista",
    descricao: "Um dia depois da entrevista, um aviso para você decidir.",
    regra: () => ({
      nome: "Decidir depois da entrevista",
      gatilho: { tipo: "entrevista_passou", horas: 24 },
      condicoes: [],
      acoes: [{ tipo: "avisar", quem: "eu" }],
      vale_em: "vaga",
    }),
  },
];

export function modeloPeloSlug(slug: string | null | undefined) {
  return MODELOS.find((m) => m.slug === slug) ?? null;
}

/** O que a regra fez com a pessoa, numa frase curta ("foi para Em análise e recebeu a mensagem"). */
export function textoDoQueFez(feitas: { tipo: string; resultado: string; etapa?: string | null }[]) {
  const partes = feitas.flatMap((f) => {
    if (f.resultado === "pulada" || f.resultado.startsWith("falhou")) return [];
    switch (f.tipo) {
      case "mover":
        return [
          f.etapa === "nao_seguiu"
            ? "foi para Não seguiu"
            : `foi para ${NOME_ETAPA_DA_REGRA[f.etapa as EtapaDaRegra] ?? "outra etapa"}`,
        ];
      case "aceitar":
        return [f.resultado === "aceita" ? "foi aceita (falta o currículo)" : "foi aceita"];
      case "dispensar":
        return ["foi dispensada, com o retorno"];
      case "mensagem":
        return [f.resultado === "agendada" ? "vai receber a mensagem" : "recebeu a mensagem"];
      case "teste":
        return ["recebeu o pedido do teste"];
      case "video":
        return ["recebeu o pedido do vídeo"];
      case "horarios":
        return ["recebeu os horários livres"];
      case "avisar":
        return ["gerou um aviso"];
      default:
        return [];
    }
  });
  return partes.length ? juntar(partes) : "nada a fazer (já estava assim)";
}
