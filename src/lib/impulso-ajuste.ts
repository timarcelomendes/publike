import { formatarMoeda } from "./formato";
import { limparBusca, PERTO_DE_GOIANIA } from "./impulso";
import { lanceDoRobo } from "./impulso-lance";

// O ajuste diário do impulso, em beta (13/11/2026, claude/plano-impulsionar-vaga.md): as regras, sem banco e sem
// Google, para o robô (servidor/impulso-ajuste.ts) e para o teste. Toda manhã, com o dia anterior inteiro: a verba do
// dia, o lance, o raio e as buscas que não são da vaga. Cada mudança vem com o texto que o cliente lê.

export type TipoDaMudanca =
  "verba" | "lance" | "raio" | "buscas" | "pausa" | "nada";

export type Mudanca = {
  tipo: TipoDaMudanca;
  /** na campanha do cliente, as buscas são de uma vaga (o grupo dela) */
  impulso_id?: string;
  antes?: number | null;
  depois?: number | string[] | null;
  /** o que mudou, para o cliente ler */
  texto: string;
  /** por quê, em uma frase */
  porque?: string;
  /** as buscas tiradas, cada uma com o porquê da IA */
  itens?: { busca: string; porque: string }[];
};

/** O que o robô sabe da campanha para decidir: o banco (a verba e o gasto) e o Google (os números da janela). */
export type Situacao = {
  /** a verba para o Google, toda (na campanha do cliente, a de todas as vagas) */
  verba: number;
  dias: number;
  /** o gasto até agora */
  gasto: number;
  /** os dias que faltam até o fim (com fração) */
  faltam: number;
  /** o orçamento do dia no Google agora */
  orcamento: number;
  /** a janela: os dias inteiros mais recentes (até 3), sem hoje; 0 quando o impulso entrou no ar ontem */
  diasNaJanela: number;
  impressoes: number;
  cliques: number;
  /** o custo na janela */
  custo: number;
  /** em quantas das buscas que podiam mostrar o anúncio ele apareceu (0 a 1; null sem dado) */
  parcela: number | null;
  /** as buscas perdidas para quem pagava mais (0 a 1) */
  perdeLance: number | null;
  /** as buscas perdidas porque a verba do dia acabou (0 a 1) */
  perdeVerba: number | null;
  /** o jeito do lance no Google (o do robô é TARGET_SPEND, o "Maximizar cliques"; outro foi mudado à mão) */
  estrategia: string | null;
  /** o máximo por clique agora (R$) */
  teto: number | null;
  /** o raio da vaga sem o ajuste (na campanha do cliente, o maior dos endereços) */
  raio: number;
  /** os km que o ajuste já pôs a mais */
  raioExtra: number;
};

export type Regras = {
  /** o lance nunca passa disso (R$) */
  tetoMax: number;
  /** os km a mais que o ajuste pode pôr no raio */
  raioMax: number;
};

const reais = (n: number) => formatarMoeda(Math.round(n * 100) / 100);
const parte = (x: number) => `${Math.round(x * 100)}%`;
const centavos = (n: number) => Math.round(n * 100) / 100;
/** o lance anda de 10 em 10 centavos */
const dezCentavos = (n: number) => Math.round(n * 10) / 10;

/** O menor orçamento por dia (o Google aceita menos, mas abaixo disso a campanha quase não aparece). */
export const MENOR_VERBA_DO_DIA = 1;
/** O menor lance por clique que o ajuste deixa. */
export const MENOR_TETO = 1;
/** Quanto o raio cresce de cada vez (km). */
export const PASSO_DO_RAIO = 5;

/** Quanto da verba do dia a campanha usou na janela (0 a 1, ou mais). */
export function usoDaVerba(s: Situacao) {
  return s.diasNaJanela > 0
    ? s.custo / Math.max(s.orcamento * s.diasNaJanela, 0.01)
    : null;
}

/**
 * A verba do dia no passo: o que sobrou vai para os dias que faltam (e o que o Google gastou a mais sai deles). Nunca
 * abaixo de R$ 1 nem acima de 3 vezes a verba do dia combinada. A verba acabou antes do fim: o impulso de uma vaga
 * para (`podeParar`); na campanha do cliente, onde o admin pode pôr mais verba, fica no mínimo.
 */
export function decidirVerba(s: Situacao, podeParar: boolean): Mudanca | null {
  if (s.faltam < 0.5 || s.verba <= 0 || s.dias <= 0) return null;
  const restante = centavos(s.verba - s.gasto);
  if (restante < 0.5 && podeParar) {
    return {
      tipo: "pausa",
      antes: s.orcamento,
      depois: 0,
      texto: `O anúncio parou: a verba de ${reais(s.verba)} acabou.`,
      porque: `O Google já usou ${reais(s.gasto)}, e o combinado é não passar da verba.`,
    };
  }
  const plano = s.verba / s.dias;
  const novo = centavos(
    Math.min(
      Math.max(restante / Math.max(s.faltam, 1), MENOR_VERBA_DO_DIA),
      Math.max(plano * 3, 1),
    ),
  );
  if (Math.abs(novo - s.orcamento) < Math.max(0.5, s.orcamento * 0.1))
    return null;
  const dias = Math.max(1, Math.round(s.faltam));
  const quando = dias === 1 ? "o último dia" : `os ${dias} dias que faltam`;
  if (novo > s.orcamento) {
    return {
      tipo: "verba",
      antes: s.orcamento,
      depois: novo,
      texto: `A verba do dia subiu de ${reais(s.orcamento)} para ${reais(novo)}.`,
      porque: `Sobraram ${reais(Math.max(restante, 0))} da verba, e eles vão para ${quando}.`,
    };
  }
  return {
    tipo: "verba",
    antes: s.orcamento,
    depois: novo,
    texto: `A verba do dia baixou de ${reais(s.orcamento)} para ${reais(novo)}.`,
    porque:
      restante > 0
        ? `O Google gastou mais nos primeiros dias: assim os ${reais(restante)} que faltam duram até o fim.`
        : "A verba já foi toda usada: o anúncio fica no mínimo até o fim.",
  };
}

/**
 * O lance (o máximo por clique). Com pelo menos 1 dia inteiro e 20 vistas na janela:
 * - perdia 30% ou mais das buscas para quem pagava mais e a verba sobrava: sobe 25%, até o teto das Regras;
 * - a verba acabava cedo (30% ou mais das buscas perdidas por ela) e o clique já custava perto do máximo: desce 20%,
 *   até R$ 1. Com o clique mais barato, a mesma verba rende mais cliques.
 */
export function decidirLance(s: Situacao, r: Regras): Mudanca | null {
  // só no jeito de lance do robô: o lance mudado à mão no Google Ads fica como está
  if (
    !lanceDoRobo(s.estrategia) ||
    s.teto == null ||
    s.diasNaJanela < 1 ||
    s.impressoes < 20
  )
    return null;
  const usou = usoDaVerba(s) ?? 1;
  if (
    s.perdeLance != null &&
    s.perdeLance >= 0.3 &&
    usou < 0.8 &&
    s.teto < r.tetoMax - 0.05
  ) {
    const novo = Math.min(dezCentavos(s.teto * 1.25), r.tetoMax);
    return {
      tipo: "lance",
      antes: s.teto,
      depois: novo,
      texto: `O clique pode custar até ${reais(novo)} (era até ${reais(s.teto)}).`,
      porque: `O anúncio perdia ${parte(s.perdeLance)} das buscas para quem pagava mais, e a verba sobrava.`,
    };
  }
  const cpc = s.cliques > 0 ? s.custo / s.cliques : 0;
  if (
    s.perdeVerba != null &&
    s.perdeVerba >= 0.3 &&
    cpc >= 0.6 * s.teto &&
    s.teto > MENOR_TETO + 0.05
  ) {
    const novo = Math.max(dezCentavos(s.teto * 0.8), MENOR_TETO);
    return {
      tipo: "lance",
      antes: s.teto,
      depois: novo,
      texto: `O clique passa a custar até ${reais(novo)} (era até ${reais(s.teto)}).`,
      porque: `A verba do dia acabava cedo, e o anúncio sumia em ${parte(s.perdeVerba)} das buscas. Com o clique mais barato, ela rende mais cliques.`,
    };
  }
  return null;
}

/**
 * O raio: com 2 dias inteiros de pouca busca perto da vaga (menos de 30 vistas por dia) e a verba sobrando (menos da
 * metade usada), sem perder por lance (aí o caso é o lance), 5 km a mais, até o máximo das Regras e 65 km.
 */
export function decidirRaio(
  s: Situacao,
  r: Regras,
  varios = false,
): Mudanca | null {
  if (s.diasNaJanela < 2 || s.raioExtra + PASSO_DO_RAIO > r.raioMax)
    return null;
  const porDia = s.impressoes / s.diasNaJanela;
  const usou = usoDaVerba(s) ?? 1;
  if (
    porDia >= 30 ||
    usou >= 0.5 ||
    (s.perdeLance != null && s.perdeLance >= 0.3)
  )
    return null;
  const de = Math.min(s.raio + s.raioExtra, 65);
  const para = Math.min(s.raio + s.raioExtra + PASSO_DO_RAIO, 65);
  if (para <= de) return null;
  const vistas =
    porDia < 1
      ? "menos de 1 vista por dia"
      : `${Math.round(porDia)} ${Math.round(porDia) === 1 ? "vista" : "vistas"} por dia`;
  return {
    tipo: "raio",
    antes: de,
    depois: para,
    texto: varios
      ? `O anúncio passa a aparecer ${PASSO_DO_RAIO} km mais longe das vagas (até ${para} km).`
      : `O anúncio passa a aparecer até ${para} km da vaga (eram ${de} km).`,
    porque: `Pouca gente procura perto: ${vistas}, e a verba sobrava.`,
  };
}

/** O resumo do dia quando nada muda (para o cliente ver que o robô olhou). */
export function nadaAMudar(s: Situacao): Mudanca {
  if (s.diasNaJanela === 0) {
    return {
      tipo: "nada",
      texto: "Nada a mudar hoje.",
      porque:
        "O anúncio entrou no ar ontem: o primeiro dia ainda é curto para mexer no lance e no raio.",
    };
  }
  const dias =
    s.diasNaJanela === 1 ? "ontem" : `nos últimos ${s.diasNaJanela} dias`;
  const numeros = `${s.impressoes} ${s.impressoes === 1 ? "vista" : "vistas"} e ${s.cliques} ${s.cliques === 1 ? "clique" : "cliques"} ${dias}`;
  return {
    tipo: "nada",
    texto: "Nada a mudar hoje.",
    porque:
      s.parcela != null && s.parcela > 0
        ? `${numeros[0].toUpperCase()}${numeros.slice(1)}, e o anúncio apareceu em ${parte(s.parcela)} das buscas que podia.`
        : `${numeros[0].toUpperCase()}${numeros.slice(1)}.`,
  };
}

// ------------------------------------------------------------------ as buscas de verdade

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Mn}/gu, "");
const comparar = (t: string) =>
  semAcento(t.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** As palavras de quem procura qualquer emprego, sem dizer qual (com as de ligação e as do jeito de buscar). */
const DE_QUALQUER_EMPREGO = new Set(
  (
    "vaga vagas emprego empregos trabalho trabalhos trabalhar servico servicos oportunidade oportunidades contratando " +
    "contrata contratacao contratam de da do das dos em no na nos nas para pra pro perto proximo proxima proximos " +
    "proximas mim aqui hoje agora urgente urgencia sem experiencia com e o a os as procuro procurando preciso quero " +
    "estou imediato imediata imediatamente carteira assinada clt home office go goias regiao bairro cidade centro zona " +
    "norte sul leste oeste meio periodo turno noite noturno manha tarde fim semana segunda opcao novas nova novo"
  ).split(" "),
);

/**
 * A busca de quem procura qualquer emprego na região ("vagas de emprego em goiânia", "emprego perto de mim"): nunca
 * sai, mesmo que a IA diga. Sobra alguma palavra além das de emprego, das de ligação e do lugar: não é.
 */
export function buscaDeQualquerEmprego(busca: string, lugares: string[]) {
  const doLugar = new Set(
    [...lugares, ...PERTO_DE_GOIANIA, "goiania"]
      .flatMap((l) => comparar(l).split(" "))
      .filter((p) => p.length > 1),
  );
  const resto = comparar(busca)
    .split(" ")
    .filter((p) => p && !DE_QUALQUER_EMPREGO.has(p) && !doLugar.has(p));
  return resto.length === 0;
}

/** A busca como o Google aceita numa palavra negativa (a mesma regra das palavras da vaga), ou null. */
export function buscaComoNegativa(busca: string) {
  return limparBusca(busca);
}

/** Para comparar duas buscas (sem acento, sem pontuação). */
export function mesmaBusca(a: string, b: string) {
  return comparar(a) === comparar(b);
}

export type BuscaReal = { busca: string; impressoes: number; cliques: number };

/**
 * As buscas de uma vaga que a IA ainda não julgou: limpas, sem as já julgadas, sem as palavras da própria vaga (a
 * negativa exata tiraria a vaga da própria busca), sem as de qualquer emprego. As com mais vistas primeiro, até
 * `limite`.
 */
export function buscasParaJulgar(
  buscas: BuscaReal[],
  o: {
    julgadas: string[];
    daVaga: Iterable<string>;
    lugares: string[];
    limite?: number;
  },
): BuscaReal[] {
  const ja = new Set([...o.julgadas, ...o.daVaga].map(comparar));
  const vistas = new Set<string>();
  const out: BuscaReal[] = [];
  for (const b of [...buscas].sort(
    (x, y) => y.impressoes - x.impressoes || y.cliques - x.cliques,
  )) {
    const limpa = buscaComoNegativa(b.busca);
    if (!limpa) continue;
    const c = comparar(limpa);
    if (ja.has(c) || vistas.has(c) || buscaDeQualquerEmprego(limpa, o.lugares))
      continue;
    vistas.add(c);
    out.push({ ...b, busca: limpa });
    if (out.length >= (o.limite ?? 40)) break;
  }
  return out;
}

/** O texto das buscas tiradas de uma vaga: as 2 primeiras entre aspas e quantas mais. */
export function textoDasBuscas(
  tiradas: { busca: string; porque: string }[],
): Mudanca["texto"] {
  const n = tiradas.length;
  const nomes = tiradas.slice(0, 2).map((t) => `“${t.busca}”`);
  const lista =
    n <= 2 ? nomes.join(" e ") : `${nomes.join(", ")} e mais ${n - 2}`;
  return n === 1
    ? `Tirou 1 busca que não é desta vaga: ${lista}.`
    : `Tirou ${n} buscas que não são desta vaga: ${lista}.`;
}
