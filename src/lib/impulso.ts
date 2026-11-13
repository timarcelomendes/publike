// O impulso da vaga (claude/plano-impulsionar-vaga.md): o texto do anúncio no Google, feito da vaga. Vale no navegador
// (a prévia na hora de comprar) e no servidor (o robô que cria o anúncio). Os limites do Google: títulos até 30 letras
// (de 3 a 15), descrições até 90 (de 2 a 4), palavras-chave até 80 letras e 10 palavras, caminhos até 15 letras.
// Nada de exclamação, de LETRA MAIÚSCULA de enfeite nem de referência a idade, sexo ou aparência (a lei e o Google).

import { REGIMES, nomeJornada } from "./constantes";
import { formatarMoeda } from "./formato";
import type { Regime } from "./tipos";

/** O utm_campaign do anúncio: a página da vaga reconhece quem chegou por ele. */
export const CAMPANHA_DO_IMPULSO = "impulso";

/**
 * A menor verba por dia do impulso pelo admin (13/11/2026, Marcelo: "menos de R$ 10,00 por dia não vale a pena"): com
 * R$ 4 por dia, as campanhas ficaram com 0 vistas. O banco confere de novo (admin_impulsionar_cliente).
 */
export const VERBA_MINIMA_POR_DIA = 10;

/** Quantos dias cabem na verba com a menor verba por dia (de 1 a 30; 0 quando não dá nem 1 dia). */
export function diasQueCabem(verba: number) {
  return Math.min(30, Math.floor((verba + 0.005) / VERBA_MINIMA_POR_DIA));
}

/** O fim do endereço de cada anúncio (o Google põe depois da página da vaga). */
export function sufixoDoImpulso(codigo: string) {
  return `utm_source=google&utm_medium=cpc&utm_campaign=${CAMPANHA_DO_IMPULSO}&utm_content=${codigo}`;
}

export type VagaDoImpulso = {
  id: string;
  titulo: string;
  cidade: string;
  bairro: string;
  regime?: string | null;
  jornada?: string | null;
  modelo?: string | null;
  pagamento_valor?: number | null;
  pagamento_ate?: number | null;
  pagamento_unidade?: string | null;
  comissao?: boolean | null;
  vagas?: number | null;
};

export type TextoDoAnuncio = {
  titulos: string[];
  descricoes: string[];
  /** as palavras-chave que vão na criação da campanha (as primeiras de `todas`) */
  palavras: string[];
  /** todas as buscas da vaga (`buscasDaVaga`): o robô põe as que faltam no grupo depois de criar e a cada medida */
  todas: string[];
  caminho1: string;
  caminho2: string;
};

const POR: Record<string, string> = {
  hora: "por hora",
  dia: "por dia",
  semana: "por semana",
  mes: "por mês",
};

/** "AUXILIAR DE COZINHA (M/F) - URGENTE!" → "Auxiliar de cozinha": a função, sem enfeite. */
export function funcaoDoTitulo(titulo: string) {
  let t = titulo
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(
      /\b(urgente|contrata-se|contratamos|precisa-se|oportunidade)\b/gi,
      " ",
    )
    .replace(/^\s*(vagas?|emprego)\s+(de|para|p\/)\s+/i, "")
    // "Auxiliar fiscal p/ escritório": o "p/" é "para" (senão a função curta vira "Auxiliar fiscal p")
    .replace(/(^|\s)p\/\s*/gi, "$1para ")
    .replace(/[!?*#|]+/g, " ")
    .replace(/\s[-–—:]\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:\-–—]+$/, "")
    .trim();
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const maiusculas = t.replace(/[^A-ZÀ-Þ]/g, "");
  if (letras.length > 3 && maiusculas.length / letras.length > 0.6)
    t = t.toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Vaga de emprego";
}

const LIGACOES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "para",
  "com",
  "a",
  "o",
]);

/**
 * A função curta, para caber no título (até 28 letras): "Operador de empilhadeira e movimentação de cargas" →
 * "Operador de empilhadeira". Corta no " e ", no " para "…; senão, nas palavras inteiras.
 */
export function funcaoCurta(funcao: string, max = 28) {
  if (funcao.length <= max) return funcao;
  const corte = funcao.split(/\s(?:e|para|com|-|–)\s|,|\//)[0]?.trim() ?? "";
  if (corte.length >= 6 && corte.length <= max) return corte;
  const palavras = (corte.length >= 6 ? corte : funcao).split(" ");
  const saida: string[] = [];
  for (const p of palavras) {
    if ([...saida, p].join(" ").length > max) break;
    saida.push(p);
  }
  while (saida.length > 1 && LIGACOES.has(saida.at(-1)!.toLowerCase()))
    saida.pop();
  return saida.join(" ") || funcao.slice(0, max);
}

/** "R$ 2.300 a R$ 2.600" (ou só o valor); null sem salário. */
export function salarioDaVaga(v: VagaDoImpulso) {
  if (v.pagamento_valor == null || v.pagamento_valor <= 0) return null;
  const de = formatarMoeda(Number(v.pagamento_valor));
  return v.pagamento_ate && v.pagamento_ate > v.pagamento_valor
    ? `${de} a ${formatarMoeda(Number(v.pagamento_ate))}`
    : de;
}

const cabe = (t: string | null | undefined, max: number) =>
  t && t.length <= max ? t : null;

function semRepetir(
  lista: (string | null | undefined)[],
  max: number,
  quantos: number,
) {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const x of lista) {
    const t = cabe(x?.replace(/\s+/g, " ").trim(), max);
    if (!t) continue;
    const chave = t.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
    if (saida.length === quantos) break;
  }
  return saida;
}

/** De cada grupo, a primeira frase que cabe (sem repetir), até `quantos`. */
function umDeCada(
  grupos: (string | null | undefined)[][],
  max: number,
  quantos: number,
) {
  const saida: string[] = [];
  for (const g of grupos) {
    const [t] = semRepetir(g, max, 1).filter(
      (x) => !saida.some((y) => y.toLowerCase() === x.toLowerCase()),
    );
    if (t) saida.push(t);
    if (saida.length === quantos) break;
  }
  return saida;
}

/** A palavra que sozinha diz só o cargo, não a função ("auxiliar" de quê?). */
const SO_O_CARGO =
  /^(auxiliar|assistente|operador|operadora|ajudante|atendente|técnico|técnica|analista|agente|encarregado|encarregada|supervisor|supervisora|gerente|coordenador|coordenadora)$/i;

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Mn}/gu, "");

/** O texto para comparar: minúsculas, sem acento e sem pontuação. */
const comparavel = (t: string) =>
  semAcento(t.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A palavra do começo que diz uma função ("movimentador", "ajudante"), não um lugar ou um detalhe ("veículos"). */
const FUNCAO_NO_COMECO =
  /^(auxiliar|ajudante|assistente|operador|operadora|tecnico|tecnica|trabalhador|trabalhadora|agente|encarregad[oa]|[a-z]+(dor|dora|ista|ante|ente|eiro|eira))\b/;

/**
 * O nome da CBO como as pessoas buscam: o parêntese sai ("Carregador (veículos de transportes terrestres)" →
 * "carregador") e, quando ele é outra função, vira mais um nome ("Chapa (movimentador de mercadoria)" → "chapa" e
 * "movimentador de mercadoria"). Fora o que sozinho é só o cargo ("auxiliar").
 */
export function limparNomeDaCbo(nome: string): string[] {
  const m = /^(.*?)\s*\(([^)]*)\)\s*(.*)$/.exec(nome.trim());
  const nomes = [m ? `${m[1]} ${m[3]}` : nome];
  if (m && FUNCAO_NO_COMECO.test(comparavel(m[2]))) nomes.push(m[2]);
  return nomes
    .map((n) => n.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(
      (n) =>
        n.length >= 3 &&
        !n.split(" ").every((w) => SO_ISSO_NAO.test(semAcento(w))),
    );
}

/**
 * As famílias de funções que se trocam entre si: quem busca uma também topa a outra ("movimentador de mercadorias",
 * "ajudante de carga e descarga", "chapa"). `sinais`: o pedaço do nome da função (sem acento) que põe a vaga na
 * família; `buscas`: os nomes que as pessoas digitam no Google para essas vagas. O anúncio da vaga aparece para
 * todos eles (claude/plano-impulsionar-vaga.md, 13/11/2026).
 */
const FAMILIAS: { sinais: RegExp; menos?: RegExp; buscas: string[] }[] = [
  {
    sinais:
      /\b(movimentador|carregador|carga e descarga|descarga|chapa\b|ajudante de deposito|auxiliar de deposito|ajudante de caminhao|ajudante de motorista|estivador)/,
    buscas: [
      "ajudante de carga e descarga",
      "auxiliar de carga e descarga",
      "carga e descarga",
      "movimentador de mercadorias",
      "ajudante de depósito",
      "auxiliar de depósito",
      "ajudante de caminhão",
      "chapa",
      "carregador",
      "separador de mercadorias",
      "auxiliar de logística",
      "auxiliar de armazém",
      "ajudante geral",
    ],
  },
  {
    sinais:
      /\b(estoqu|separador|separadora|conferente|almoxarif|logistic|expedi|armazen|armazem)/,
    buscas: [
      "auxiliar de estoque",
      "estoquista",
      "separador de mercadorias",
      "separador de pedidos",
      "conferente",
      "conferente de mercadorias",
      "auxiliar de logística",
      "auxiliar de expedição",
      "auxiliar de almoxarifado",
      "almoxarife",
      "auxiliar de armazém",
      "operador de logística",
      "movimentador de mercadorias",
    ],
  },
  {
    sinais:
      /\b(producao|operador de maquina|montador|montadora|embalador|embaladora|auxiliar de linha|auxiliar de fabrica)/,
    buscas: [
      "auxiliar de produção",
      "ajudante de produção",
      "operador de produção",
      "auxiliar de linha de produção",
      "operador de máquinas",
      "embalador",
      "montador",
      "auxiliar de fábrica",
      "ajudante geral",
    ],
  },
  {
    sinais:
      /\b(cozinh|chapeir|pizzaiol|salgadeir|sushiman|churrasqueir|copeir)/,
    buscas: [
      "auxiliar de cozinha",
      "ajudante de cozinha",
      "cozinheiro",
      "cozinheira",
      "chapeiro",
      "auxiliar de cozinha industrial",
      "salgadeira",
      "pizzaiolo",
      "copeira",
      "auxiliar de restaurante",
    ],
  },
  {
    sinais:
      /\b(garcom|garconete|cumim|atendente de restaurante|atendente de lanchonete|barman|barista|maitre)/,
    buscas: [
      "garçom",
      "garçonete",
      "cumim",
      "auxiliar de garçom",
      "atendente de restaurante",
      "atendente de lanchonete",
      "barman",
      "barista",
    ],
  },
  {
    sinais: /\b(padeir|confeiteir|padaria|confeitaria)/,
    buscas: [
      "padeiro",
      "auxiliar de padeiro",
      "auxiliar de padaria",
      "ajudante de padaria",
      "confeiteiro",
      "confeiteira",
      "balconista de padaria",
    ],
  },
  {
    sinais: /\b(acougu|desossador)/,
    buscas: [
      "açougueiro",
      "auxiliar de açougue",
      "balconista de açougue",
      "desossador",
    ],
  },
  {
    sinais:
      /\b(limpeza|faxin|zelador|zeladora|servicos gerais|camareir|conservacao|asg\b|higieniza)/,
    buscas: [
      "auxiliar de limpeza",
      "auxiliar de serviços gerais",
      "serviços gerais",
      "faxineira",
      "faxineiro",
      "zelador",
      "camareira",
      "auxiliar de conservação",
      "auxiliar de higienização",
    ],
  },
  {
    sinais:
      /\b(recepcion|auxiliar de atendimento|atendente\b(?! de (restaurante|lanchonete|farmacia|drogaria|telemarketing|call center|padaria|acougue)))/,
    buscas: [
      "recepcionista",
      "atendente",
      "auxiliar de atendimento",
      "atendente de recepção",
      "auxiliar de recepção",
      "atendente de loja",
    ],
  },
  {
    sinais:
      /\b(telemarket|teleatend|call center|sac\b|operador de atendimento)/,
    buscas: [
      "operador de telemarketing",
      "atendente de telemarketing",
      "telemarketing",
      "teleatendente",
      "atendente de call center",
      "operador de sac",
    ],
  },
  {
    sinais:
      /\b(vendedor|vendedora|vendas|consultor de vendas|consultora de vendas|representante comercial|promotor|promotora|balconista)/,
    buscas: [
      "vendedor",
      "vendedora",
      "vendedor interno",
      "vendedor externo",
      "consultor de vendas",
      "atendente de loja",
      "balconista",
      "representante comercial",
      "promotor de vendas",
    ],
  },
  {
    sinais:
      /\b(operador de caixa|operadora de caixa|caixa\b|repositor|repositora|empacotador|fiscal de caixa|fiscal de loja)/,
    buscas: [
      "operador de caixa",
      "operadora de caixa",
      "caixa de supermercado",
      "repositor",
      "repositor de mercadorias",
      "empacotador",
      "fiscal de caixa",
      "auxiliar de loja",
      "supermercado",
      "atacadista",
    ],
  },
  {
    sinais:
      /\b(administrativ|secretari|auxiliar de escritorio|assistente de escritorio)/,
    buscas: [
      "auxiliar administrativo",
      "assistente administrativo",
      "auxiliar de escritório",
      "assistente de escritório",
      "secretária",
      "auxiliar de secretaria",
    ],
  },
  {
    sinais:
      /\b(recursos humanos|rh|departamento pessoal|dp|folha de pagamento|recrutamento)\b/,
    buscas: [
      "auxiliar de rh",
      "assistente de rh",
      "auxiliar de recursos humanos",
      "auxiliar de departamento pessoal",
      "assistente de departamento pessoal",
      "analista de departamento pessoal",
    ],
  },
  {
    sinais:
      /\b(fiscal(?! de (loja|caixa|prevencao|perdas|piso|salao|obra|patio|transporte|onibus))|fiscais|tribut|imposto|contab|contador|contadora)/,
    buscas: [
      "auxiliar fiscal",
      "assistente fiscal",
      "analista fiscal",
      "auxiliar de escrita fiscal",
      "auxiliar contábil",
      "assistente contábil",
      "analista contábil",
      "auxiliar de contabilidade",
      "escritório de contabilidade",
    ],
  },
  {
    sinais:
      /\b(financ|contas a pagar|contas a receber|tesour|faturament|cobranca)/,
    buscas: [
      "auxiliar financeiro",
      "assistente financeiro",
      "analista financeiro",
      "contas a pagar",
      "contas a receber",
      "auxiliar de faturamento",
      "auxiliar de cobrança",
      "assistente de cobrança",
    ],
  },
  {
    sinais: /\b(motorista|condutor)/,
    // o ajudante de motorista é da carga e descarga (sem "lookbehind" na regex: o Safari antigo não entende)
    menos: /\bajudante de motorista\b/,
    buscas: [
      "motorista",
      "motorista cnh d",
      "motorista cnh c",
      "motorista cnh b",
      "motorista de caminhão",
      "motorista entregador",
      "motorista de van",
    ],
  },
  {
    sinais: /\b(entregador|entregadora|motoboy|motofret|motoentregador)/,
    buscas: [
      "entregador",
      "motoboy",
      "entregador de moto",
      "motoentregador",
      "motofretista",
      "entregador de delivery",
    ],
  },
  {
    sinais:
      /\b(pedreiro|servente de pedreiro|servente de obra|ajudante de obra|auxiliar de obra|obras\b|construcao civil|armador|carpinteiro|mestre de obra|azulejista|gesseiro)/,
    buscas: [
      "ajudante de pedreiro",
      "servente de pedreiro",
      "servente de obras",
      "ajudante de obras",
      "auxiliar de obras",
      "pedreiro",
      "construção civil",
      "armador",
      "carpinteiro",
      "ajudante geral",
    ],
  },
  {
    sinais:
      /\b(manutencao|eletricista|encanador|bombeiro hidraulico|pintor|marceneiro|serralheiro|soldador|predial)/,
    buscas: [
      "auxiliar de manutenção",
      "manutenção predial",
      "oficial de manutenção",
      "técnico de manutenção",
      "eletricista",
      "auxiliar de eletricista",
      "encanador",
      "pintor",
    ],
  },
  {
    sinais:
      /\b(porteir|portaria|vigia\b|vigilante|agente de seguranca|seguranca patrimonial|seguranca\b(?! do trabalho)|controlador de acesso|controladora de acesso)/,
    buscas: [
      "porteiro",
      "porteiro noturno",
      "controlador de acesso",
      "auxiliar de portaria",
      "vigia",
      "vigilante",
      "segurança",
    ],
  },
  {
    sinais: /\b(enfermag|enfermeir)/,
    buscas: [
      "técnico de enfermagem",
      "técnico em enfermagem",
      "auxiliar de enfermagem",
      "enfermeiro",
      "enfermeira",
    ],
  },
  {
    sinais: /\b(cuidador|cuidadora|acompanhante de idoso|baba\b)/,
    buscas: [
      "cuidador de idosos",
      "cuidadora de idosos",
      "cuidador",
      "acompanhante de idosos",
      "babá",
      "cuidadora infantil",
    ],
  },
  {
    sinais: /\b(farmac|drogaria)/,
    buscas: [
      "atendente de farmácia",
      "balconista de farmácia",
      "auxiliar de farmácia",
      "operador de caixa farmácia",
      "farmacêutico",
    ],
  },
  {
    sinais:
      /\b(cabeleireir|manicure|pedicure|esteticist|barbeir|maquiador|depilador|sobrancelha|salao de beleza)/,
    buscas: [
      "manicure",
      "cabeleireira",
      "cabeleireiro",
      "barbeiro",
      "esteticista",
      "designer de sobrancelha",
      "auxiliar de cabeleireiro",
    ],
  },
  {
    sinais: /\b(mecanic|funileir|lanterneir|auto pecas|autopecas)/,
    buscas: [
      "mecânico",
      "auxiliar de mecânico",
      "ajudante de mecânico",
      "mecânico de automóveis",
      "mecânico de motos",
      "funileiro",
    ],
  },
  {
    sinais: /\b(frentista|lavador|lava jato|borracheir|polidor)/,
    buscas: [
      "frentista",
      "lavador de carros",
      "lava jato",
      "borracheiro",
      "polidor automotivo",
    ],
  },
  {
    sinais: /\b(domestic|empregada|caseir|jardineir|passadeir|diarista)/,
    buscas: [
      "empregada doméstica",
      "doméstica",
      "diarista",
      "caseiro",
      "jardineiro",
      "passadeira",
    ],
  },
  {
    sinais:
      /\b(professor|professora|auxiliar de sala|auxiliar de classe|auxiliar de creche|monitor escolar|monitora escolar|pedagog|recreador)/,
    buscas: [
      "professor",
      "professora",
      "auxiliar de sala",
      "auxiliar de professor",
      "auxiliar de creche",
      "monitor escolar",
      "recreador",
    ],
  },
  {
    sinais:
      /\b(suporte tecnico|informatica|ti|desenvolvedor|programador|help desk|helpdesk)\b/,
    buscas: [
      "suporte técnico",
      "técnico de informática",
      "auxiliar de ti",
      "analista de suporte",
      "help desk",
      "desenvolvedor",
      "programador",
    ],
  },
  {
    sinais: /\b(costureir|costura|overloquista|modelista)/,
    buscas: [
      "costureira",
      "costureiro",
      "auxiliar de costura",
      "costureira industrial",
      "overloquista",
    ],
  },
];

/**
 * As buscas das famílias da vaga, pela função do título; só sem família pelo título, pelo nome oficial da CBO (a CBO
 * vem de uma regra e pode errar: o título é o que a empresa escreveu).
 */
function buscasDaFamilia(funcao: string, nomeDaCbo?: string) {
  const familias = (t: string) => {
    const x = ` ${comparavel(t)} `;
    return FAMILIAS.filter((f) => f.sinais.test(x) && !f.menos?.test(x));
  };
  const achadas = familias(funcao).length
    ? familias(funcao)
    : nomeDaCbo
      ? familias(nomeDaCbo)
      : [];
  return [...new Set(achadas.flatMap((f) => f.buscas))];
}

/** As cidades em volta de Goiânia: quem mora nelas também busca "vagas em Goiânia". */
export const PERTO_DE_GOIANIA = new Set([
  "aparecida de goiania",
  "senador canedo",
  "trindade",
  "goianira",
  "neropolis",
  "hidrolandia",
  "bela vista de goias",
  "abadia de goias",
  "aragoiania",
  "guapo",
  "bonfinopolis",
  "caldazinha",
  "brazabrantes",
  "nova veneza",
  "santo antonio de goias",
  "terezopolis de goias",
  "inhumas",
  "caturai",
  "goianapolis",
]);

/** As buscas da forma de contratar, do horário e do jeito da vaga ("jovem aprendiz", "vagas clt", "trabalho noturno"). */
function buscasDaForma(v: VagaDoImpulso) {
  const cidade = v.cidade.trim().toLowerCase();
  const lista: string[] = [];
  const porRegime: Record<string, string[]> = {
    clt: [
      "vagas clt",
      `vagas clt ${cidade}`,
      "emprego carteira assinada",
      `vaga carteira assinada ${cidade}`,
    ],
    aprendiz: [
      "jovem aprendiz",
      `jovem aprendiz ${cidade}`,
      "vagas jovem aprendiz",
      "menor aprendiz",
    ],
    estagio: [
      "vaga de estágio",
      `vagas de estágio ${cidade}`,
      "estágio remunerado",
      "estagiário",
    ],
    trainee: ["programa de trainee", "vaga de trainee"],
    temporario: [
      "vaga temporária",
      "emprego temporário",
      `emprego temporário ${cidade}`,
    ],
    intermitente: ["vaga intermitente", "trabalho intermitente"],
    diaria: [
      "trabalho por diária",
      "vaga diária",
      `freelancer ${cidade}`,
      "vagas freelancer",
    ],
    freelance: ["vagas freelancer", `freelancer ${cidade}`, `freela ${cidade}`],
  };
  lista.push(...(porRegime[v.regime ?? ""] ?? []));
  const porJornada: Record<string, string[]> = {
    meio_periodo: [
      "emprego meio período",
      "trabalho meio período",
      "vaga meio período",
    ],
    noturno: ["vagas noturnas", "trabalho noturno", "emprego noturno"],
    escala_12x36: ["escala 12x36", "vaga 12x36"],
    fim_de_semana: [
      "trabalho fim de semana",
      "vagas fim de semana",
      "emprego final de semana",
    ],
  };
  lista.push(...(porJornada[v.jornada ?? ""] ?? []));
  if (v.modelo === "remoto")
    lista.push("vaga home office", "trabalho remoto", "emprego home office");
  return lista;
}

/** Quantas palavras vão no grupo quando a campanha nasce (as outras entram logo depois, uma a uma). */
export const PALAVRAS_AO_NASCER = 15;
/** O máximo de palavras no grupo de uma vaga. */
const MAXIMO_DE_PALAVRAS = 220;

/**
 * Todas as buscas da vaga, da mais perto à mais longe (claude/plano-impulsionar-vaga.md, 13/11/2026: "toda e qualquer
 * variação possível da vaga"):
 * 1. a função do título (inteira e curta), com "vaga de", "emprego de", "trabalho de", a cidade, o bairro, "perto de
 *    mim", "urgente" e "contratando";
 * 2. os nomes da CBO (`nomesDaCbo`: o oficial e os sinônimos, limpos) e os das funções da mesma família
 *    (`FAMILIAS`), com "vaga de", "emprego de" e a cidade;
 * 3. com a forma de contratar na frente (aprendiz, estágio, trainee), as buscas dela (`buscasDaForma`).
 * Nunca as buscas largas de emprego ("vagas de emprego", "empregos goiânia", "procuro emprego"): são as da campanha
 * geral do Publike, que leva ao mesmo site e sempre ganha (13/11/2026: no Diagnóstico do Google, o impulso do
 * Movimentador saía de "vagas de emprego em goiânia" porque a geral tinha a palavra igual ou classificação maior; os
 * impulsos tiveram 0 vistas). Todas de correspondência ampla: o Google pega também o plural, o sem acento e o jeito parecido de escrever. As
 * primeiras `PALAVRAS_AO_NASCER` vão na criação (o que já passava pela política do Google); as outras, logo depois.
 */
export function buscasDaVaga(v: VagaDoImpulso, nomesDaCbo: string[] = []) {
  const funcao = funcaoDoTitulo(v.titulo);
  const cidade = v.cidade.trim().toLowerCase();
  const bairro = v.bairro.trim().toLowerCase();
  const curta = funcaoCurta(funcao).toLowerCase();
  const inteira = funcaoInteira(funcao)?.toLowerCase();
  const soCargo = (n: string) =>
    n.split(" ").every((w) => SO_ISSO_NAO.test(semAcento(w)));
  const principais = [
    ...new Set(
      [curta, inteira].filter((n): n is string => Boolean(n) && !soCargo(n!)),
    ),
  ];
  const daCbo = [
    ...new Set(
      nomesDaCbo.map((n) => n.toLowerCase()).filter((n) => !soCargo(n)),
    ),
  ];
  const daFamilia = buscasDaFamilia(funcao, nomesDaCbo[0]);
  // primeiro o nome da CBO que também é o que se busca na família (o mais buscado da mesma função), depois a família,
  // por fim os outros nomes da CBO (os oficiais, que quase ninguém digita)
  const naFamilia = new Set(daFamilia.map(comparavel));
  const outros = [
    ...new Set([
      ...daCbo.filter((n) => naFamilia.has(comparavel(n))),
      ...daFamilia,
      ...daCbo.filter((n) => !naFamilia.has(comparavel(n))),
    ]),
  ].filter((n) => !principais.includes(n));
  const daForma = buscasDaForma(v);
  // sem a função no título ("Jovem aprendiz", "Estágio"), a forma de contratar é a busca da vaga
  const formaNaFrente =
    v.regime === "aprendiz" || v.regime === "estagio" || v.regime === "trainee";

  const nascer = [
    ...principais.flatMap((n) => [
      `vaga de ${n}`,
      `emprego de ${n}`,
      `vaga de ${n} ${cidade}`,
    ]),
    ...(formaNaFrente ? daForma.slice(0, 3) : []),
    ...outros.slice(0, 4).map((n) => `vaga de ${n}`),
  ];
  const resto = [
    ...principais.flatMap((n) => [
      `vagas de ${n}`,
      `trabalho de ${n}`,
      `emprego de ${n} ${cidade}`,
      `vaga de ${n} ${bairro}`,
      `vaga de ${n} perto de mim`,
      `vaga de ${n} urgente`,
      `${n} contratando`,
    ]),
    ...outros.flatMap((n) => [
      `vaga de ${n}`,
      `emprego de ${n}`,
      `vaga de ${n} ${cidade}`,
    ]),
    ...(formaNaFrente ? daForma : []),
  ];

  const vistas = new Set<string>();
  const limpar = (lista: string[]) => {
    const saida: string[] = [];
    for (const p of lista) {
      const l = palavraLimpa(p);
      if (l && !vistas.has(l)) {
        vistas.add(l);
        saida.push(l);
      }
    }
    return saida;
  };
  // as primeiras ficam no começo de todas (a ordem é a de importância)
  const daCriacao = limpar(nascer);
  const todas = [...daCriacao, ...limpar(resto)].slice(0, MAXIMO_DE_PALAVRAS);
  return { primeiras: daCriacao.slice(0, PALAVRAS_AO_NASCER), todas };
}

/**
 * A palavra (sem acento) que nunca vai sozinha para a lista da campanha geral: o cargo sem a função e a busca de
 * qualquer vaga ("auxiliar", "vaga de emprego", "jovem aprendiz").
 */
const SO_ISSO_NAO =
  /^(auxiliar|assistente|operadora?|ajudante|atendente|tecnic[oa]|analista|agente|encarregad[oa]|supervisora?|gerente|coordenadora?|vagas?|empregos?|trabalhos?|oportunidades?|estagios?|estagiari[oa]s?|jovem|aprendiz|geral|de|da|do|das|dos|e|em|para|com|a|o)$/;

/**
 * O nome da função como se busca: inteiro; o comprido, até o " e ", o " para " ou a vírgula ("Operador de
 * empilhadeira e movimentação de cargas" → "Operador de empilhadeira"). Sem cortar no meio da função, como no título
 * do anúncio: "auxiliar nos serviços" (de alimentação) tiraria a campanha geral de outras buscas.
 */
function funcaoInteira(nome: string) {
  if (nome.length <= 28) return nome;
  const corte = nome.split(/\s(?:e|para|com|-|–)\s|,|\//)[0]?.trim() ?? "";
  // o corte que sobra numa palavra só fica largo demais ("Instalador e reparador de…" → "instalador")
  return corte.length >= 3 && corte.length <= 45 && corte.includes(" ")
    ? corte
    : null;
}

/**
 * As buscas da função que a campanha geral do Publike deixa de disputar com o impulso da vaga (as palavras negativas
 * de frase da lista "Publike · funções com impulso no ar", em impulsos.ts): a função do título e os outros nomes dela
 * (os mesmos das palavras-chave do anúncio), cada um também sem o "de" ("auxiliar cozinha") e sem acento ("garcom"),
 * porque a negativa não pega as variações como a palavra-chave pega. Fica de fora o que, sozinho, é a busca de
 * qualquer vaga ("auxiliar", "jovem aprendiz", "vaga de emprego"): tiraria a geral de buscas de outras vagas.
 */
export function frasesSemDisputa(titulo: string, sinonimos: string[] = []) {
  const nomes = [funcaoDoTitulo(titulo), ...sinonimos]
    .map((n) => funcaoInteira(n.trim())?.toLowerCase())
    .filter((n): n is string => Boolean(n));
  const frases = new Set<string>();
  for (const b of [...new Set(nomes)].slice(0, 4)) {
    const semLigacao = b
      .split(" ")
      .filter((p) => !LIGACOES.has(p))
      .join(" ");
    for (const x of [b, semLigacao]) {
      for (const y of [x, semAcento(x)]) {
        const p = palavraLimpa(y);
        if (p && !p.split(" ").every((w) => SO_ISSO_NAO.test(semAcento(w))))
          frases.add(p);
      }
    }
  }
  return [...frases];
}

/** A palavra-chave como o Google aceita: minúsculas, letras, números e espaço, até 80 letras e 10 palavras. */
function palavraLimpa(t: string) {
  const p = t
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return p.length >= 3 && p.length <= 80 && p.split(" ").length <= 10
    ? p
    : null;
}

/** Um pedaço do endereço que aparece no anúncio ("publike.org/vagas/auxiliar"): sem acento, até 15 letras. */
function caminho(t: string) {
  const palavras = t
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const saida: string[] = [];
  for (const p of palavras) {
    if ([...saida, p].join("-").length > 15) break;
    saida.push(p);
  }
  while (saida.length > 1 && LIGACOES.has(saida.at(-1)!)) saida.pop();
  return saida.join("-") || (palavras[0] ?? "").slice(0, 15);
}

/**
 * O texto do anúncio. `simples`: a segunda tentativa, depois de o Google recusar a primeira (só a função, o lugar e o
 * convite, sem salário nem regime). `sinonimos`: os nomes da função na CBO, já limpos (`limparNomeDaCbo`), para as
 * palavras-chave.
 */
export function textoDoAnuncio(
  v: VagaDoImpulso,
  opcoes: { simples?: boolean; sinonimos?: string[] } = {},
): TextoDoAnuncio {
  const funcao = funcaoCurta(funcaoDoTitulo(v.titulo));
  const f = funcao.toLowerCase();
  const sal = salarioDaVaga(v);
  const por = v.pagamento_unidade ? POR[v.pagamento_unidade] : null;
  const regime =
    v.regime && v.regime in REGIMES ? REGIMES[v.regime as Regime] : null;
  const jornada = nomeJornada(v.jornada);
  const cidade = v.cidade.trim();
  const bairro = v.bairro.trim();

  // A "qualidade do anúncio" do Google pede títulos variados e com as palavras da busca: primeiro os que trazem a
  // função (inteira e encurtada, "Movimentador"), depois o salário e o regime, por fim os convites.
  const curtaCrua = funcaoCurta(funcao, 17);
  // "Auxiliar" sozinho não diz a função: aí fica a inteira
  const curta = SO_O_CARGO.test(curtaCrua) ? funcao : curtaCrua;
  const c = curta.toLowerCase();
  const titulos = opcoes.simples
    ? semRepetir(
        [
          funcao,
          `Vaga em ${cidade}`,
          "Vaga de emprego",
          "Candidatura grátis",
          "Veja a vaga",
        ],
        30,
        5,
      )
    : semRepetir(
        [
          funcao,
          `Vaga de ${f}`,
          `${funcao} em ${bairro}`,
          `${funcao} em ${cidade}`,
          `Vaga de ${c} em ${cidade}`,
          sal ? (cabe(por ? `${sal} ${por}` : sal, 30) ?? sal) : null,
          `Vaga de ${c}`,
          `Trabalhe como ${f}`,
          `Trabalhe como ${c}`,
          `Emprego de ${f}`,
          `Emprego de ${c}`,
          `${curta} em ${bairro}`,
          `Vaga em ${bairro}`,
          v.regime === "clt"
            ? "Carteira assinada"
            : regime && v.regime !== "outro"
              ? `Vaga ${v.regime === "pj" ? "PJ" : regime.selo.toLowerCase()}`
              : null,
          v.vagas && v.vagas > 1 ? `${v.vagas} vagas abertas` : null,
          v.comissao ? "Fixo mais comissão" : null,
          `Emprego em ${cidade}`,
          "Candidatura grátis",
          "Converse direto com a empresa",
          "Candidate-se pelo celular",
          "Veja a vaga no Publike",
        ],
        30,
        15,
      );
  // os títulos mínimos (3), se a vaga tiver nomes muito longos
  const minimos = semRepetir(
    [
      ...titulos,
      "Vaga de emprego",
      "Candidatura grátis",
      "Veja a vaga no Publike",
    ],
    30,
    15,
  );

  const lugar = `${bairro}, ${cidade}`;
  const descricoes = opcoes.simples
    ? semRepetir(
        [
          `Vaga de ${f} em ${cidade}. Veja a vaga e candidate-se pelo Publike.`,
          `Vaga de ${f}. Veja a vaga e candidate-se.`,
          "Veja a vaga e candidate-se pelo Publike, sem pagar nada.",
          "Candidate-se em poucos toques, pelo celular.",
        ],
        90,
        2,
      )
    : // quatro descrições diferentes entre si, cada uma com a função (o Google mede a variedade e as palavras): de
      // cada grupo, a primeira que cabe em 90 letras
      umDeCada(
        [
          [
            `${funcao} em ${lugar}.${sal ? ` ${sal}${por ? ` ${por}` : ""}.` : ""} Veja a vaga e candidate-se.`,
            sal
              ? `${funcao} em ${bairro}. ${sal}${por ? ` ${por}` : ""}. Veja a vaga e candidate-se.`
              : null,
            sal
              ? `${funcao}. ${sal}${por ? ` ${por}` : ""}. Veja a vaga e candidate-se.`
              : null,
            `${funcao} em ${lugar}. Veja a vaga e candidate-se.`,
            `Vaga de ${f} em ${cidade}. Veja a vaga e candidate-se.`,
          ],
          regime || jornada
            ? [
                `Vaga de ${f}: ${[regime?.nome, jornada?.toLowerCase()].filter(Boolean).join(", ")}. Veja requisitos e benefícios.`,
                `Vaga de ${c}: ${[regime?.nome, jornada?.toLowerCase()].filter(Boolean).join(", ")}. Veja requisitos e benefícios.`,
              ]
            : [],
          [
            `Quer trabalhar como ${f} em ${cidade}? Curta a vaga e fale com quem contrata.`,
            `Quer trabalhar como ${f}? Curta a vaga e fale direto com quem contrata.`,
            `Quer trabalhar como ${c}? Curta a vaga e fale direto com quem contrata.`,
          ],
          [
            `Candidate-se à vaga de ${f} pelo celular, em poucos toques e sem pagar nada.`,
            `Candidate-se à vaga de ${c} pelo celular, sem pagar nada.`,
          ],
          [
            "Curtiu a vaga e deu match: você conversa direto com quem contrata. É grátis.",
          ],
        ],
        90,
        4,
      );

  // as buscas da vaga: as primeiras vão na criação; as outras, logo depois (`acertarPalavras`, em impulsos.ts)
  const buscas = buscasDaVaga(v, opcoes.sinonimos);

  return {
    titulos:
      minimos.length >= 3
        ? minimos
        : [
            ...minimos,
            "Vaga de emprego",
            "Candidatura grátis",
            "Veja a vaga",
          ].slice(0, 3),
    descricoes:
      descricoes.length >= 2
        ? descricoes
        : [...descricoes, "Veja a vaga e candidate-se pelo Publike."].slice(
            0,
            2,
          ),
    palavras: buscas.primeiras,
    todas: buscas.todas,
    caminho1: "vagas",
    caminho2: caminho(funcao) || "emprego",
  };
}

// ------------------------------------------------------------------ a revisão da IA (13/11/2026)

/**
 * O que a IA mudou nas buscas da vaga, já conferido (`limparRevisao`): as que entram, as que saem e as palavras
 * negativas do grupo da vaga. Guardado no impulso (`privado.impulsos.palavras_ia`, migração 20270508120000): o robô
 * aplica em cima de `buscasDaVaga` a cada conferência, sem chamar a IA de novo.
 */
export type RevisaoDasPalavras = {
  acrescentar: string[];
  tirar: string[];
  negativas: string[];
};

/** As palavras que dizem que a busca é de emprego (sem acento). */
const INTENCAO_DE_EMPREGO =
  /\b(vagas?|empregos?|trabalh(o|os|ar)|contrata|contratando|contratacao|oportunidades?|aprendiz|estagios?|estagiari[oa]s?|freela|freelancer|diarias?|curriculo|selecao)\b/;

/**
 * O que nunca entra numa busca do anúncio de vaga (sem acento): idade, sexo, cor, estado civil, gravidez, deficiência e
 * aparência (Lei 9.029/1995 e CLT, art. 373-A); "jovem" só como "jovem aprendiz" (o contrato); e o nome de outros
 * sites de vaga e de órgão público (a marca é deles).
 */
const NUNCA_NA_BUSCA =
  /\b(mulher(es)?|homem|homens|masculin[oa]s?|feminin[oa]s?|mocas?|rapaz(es)?|senhoras?|maior de|menor de|\d+ anos|idade|aparencia|solteir[oa]s?|casad[oa]s?|gestantes?|gravidas?|brancos?|brancas?|negros?|negras?|pardos?|pardas?|pcd|deficiente|deficiencia|jovens|indeed|catho|infojobs|linkedin|gupy|sine|olx|bne|trabalha brasil|vagas com br|empregos com br)\b|\bjovem\b(?! aprendiz)/;

/** A busca limpa como o Google aceita (a mesma regra das buscas da vaga), ou null. */
export function limparBusca(t: string) {
  return palavraLimpa(t);
}

/**
 * Confere o que a IA devolveu antes de ir para o Google:
 * - **acrescentar:** limpa; sem a palavra de emprego, é o nome de uma função e vira "vaga de …"; fora o que já está
 *   na lista e o que a regra não deixa (`NUNCA_NA_BUSCA`); até 40.
 * - **tirar:** só o que está na lista, e nunca as `protegidas` (a função do título); até 40.
 * - **negativas:** de 1 a 3 palavras, sem a palavra de emprego e sem nada que esteja numa busca que fica (senão a vaga
 *   sairia da própria busca); até 20.
 */
export function limparRevisao(
  bruta: { acrescentar?: unknown; tirar?: unknown; negativas?: unknown },
  lista: string[],
  protegidas: string[],
): RevisaoDasPalavras {
  const textos = (x: unknown, campo: string) =>
    (Array.isArray(x) ? x : [])
      .map((i) =>
        typeof i === "string"
          ? i
          : i && typeof i === "object"
            ? (i as Record<string, unknown>)[campo]
            : null,
      )
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  const naLista = new Map(lista.map((p) => [comparavel(p), p]));
  const guardadas = new Set(protegidas.map(comparavel));

  const tirar: string[] = [];
  for (const t of textos(bruta.tirar, "busca")) {
    const p = naLista.get(comparavel(t));
    if (p && !guardadas.has(comparavel(p)) && !tirar.includes(p)) tirar.push(p);
    if (tirar.length === 40) break;
  }
  const ficam = new Set(
    lista.filter((p) => !tirar.includes(p)).map(comparavel),
  );

  const acrescentar: string[] = [];
  for (const t of textos(bruta.acrescentar, "busca")) {
    const limpa = palavraLimpa(t);
    if (!limpa || NUNCA_NA_BUSCA.test(comparavel(limpa))) continue;
    const busca = INTENCAO_DE_EMPREGO.test(comparavel(limpa))
      ? limpa
      : palavraLimpa(`vaga de ${limpa}`);
    if (!busca || ficam.has(comparavel(busca)) || acrescentar.includes(busca))
      continue;
    acrescentar.push(busca);
    ficam.add(comparavel(busca));
    if (acrescentar.length === 40) break;
  }

  // as palavras de todas as buscas que ficam: a negativa não pode ter nenhuma delas
  const palavrasQueFicam = new Set([...ficam].flatMap((p) => p.split(" ")));
  const negativas: string[] = [];
  for (const t of textos(bruta.negativas, "palavra")) {
    const limpa = palavraLimpa(t);
    if (!limpa) continue;
    const c = comparavel(limpa);
    const partes = c.split(" ");
    if (
      partes.length > 3 ||
      INTENCAO_DE_EMPREGO.test(c) ||
      NUNCA_NA_BUSCA.test(c)
    )
      continue;
    if (partes.some((w) => palavrasQueFicam.has(w) && !LIGACOES.has(w)))
      continue;
    if (!negativas.includes(limpa)) negativas.push(limpa);
    if (negativas.length === 20) break;
  }
  return { acrescentar, tirar, negativas };
}

/** As buscas da vaga com a revisão da IA por cima: sai o que ela tirou, entra o que ela pôs (até 260). */
export function buscasComARevisao(
  todas: string[],
  revisao: RevisaoDasPalavras | null,
) {
  if (!revisao) return todas;
  const sai = new Set(revisao.tirar);
  return [
    ...new Set([...todas.filter((p) => !sai.has(p)), ...revisao.acrescentar]),
  ].slice(0, 260);
}

/** No quadro "Vagas impulsionadas na região": até 6 vagas, no máximo 2 de cada cliente. */
export const VAGAS_NO_QUADRO = 6;
const DO_MESMO_CLIENTE = 2;

/**
 * As vagas do quadro "Vagas impulsionadas na região" (13/11/2026). Antes, as do impulso mais novo vinham primeiro: um
 * cliente com 7 vagas impulsionadas ocupava as 6 e as outras vagas pagas não apareciam. Agora a ordem gira a cada hora
 * (a mesma para todo mundo naquela hora) e cada cliente fica com até 2: ao longo do dia, toda vaga impulsionada passa
 * pelo quadro. Sem outros clientes para completar, o lugar que sobra volta para quem tem mais vagas.
 */
export function vagasDoQuadro<T extends { id: string; autor_id: string }>(
  impulsionadas: T[],
  agora: number,
): T[] {
  const hora = Math.floor(agora / 3_600_000);
  const vez = (id: string) => {
    // FNV-1a de 32 bits: a mesma vaga cai num lugar diferente a cada hora, sem sorteio
    let h = 0x811c9dc5;
    for (const c of `${hora}:${id}`)
      h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h;
  };
  const ordem = [...impulsionadas].sort(
    (x, y) => vez(x.id) - vez(y.id) || x.id.localeCompare(y.id),
  );
  const porCliente = new Map<string, number>();
  const escolhidas = new Set<T>();
  for (const v of ordem) {
    if (escolhidas.size === VAGAS_NO_QUADRO) break;
    const ja = porCliente.get(v.autor_id) ?? 0;
    if (ja >= DO_MESMO_CLIENTE) continue;
    porCliente.set(v.autor_id, ja + 1);
    escolhidas.add(v);
  }
  for (const v of ordem) {
    if (escolhidas.size === VAGAS_NO_QUADRO) break;
    escolhidas.add(v);
  }
  // na ordem da hora (as que completaram entram no lugar delas)
  return ordem.filter((v) => escolhidas.has(v));
}
