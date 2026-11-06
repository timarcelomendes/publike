import { slugDaCidade } from "./paginas-busca";

// As páginas de vaga por função e cidade (claude/plano-vagas-por-funcao.md): "Vagas de frentista em Goiânia", em
// /vagas/goiania/frentista. O nome é o do dia a dia, como as pessoas buscam ("auxiliar de cozinha", "faxineira"), e
// não o oficial da CBO ("Auxiliar nos serviços de alimentação"). São as funções mais contratadas no comércio e nos
// serviços (as mesmas das regras de src/lib/funcao-cbo.ts); uma função de fora da lista ganha página pelo nome
// oficial quando tem vaga no ar (src/lib/servidor/paginas-funcao.ts).

export type FuncaoDaPagina = { cbo: string; slug: string; nome: string };

// [código da CBO, nome do dia a dia]; o slug sai do nome
const LISTA: [string, string][] = [
  ["513505", "auxiliar de cozinha"],
  ["513205", "cozinheiro"],
  ["513405", "garçom"],
  ["513415", "cumim"],
  ["513435", "atendente de lanchonete"],
  ["513440", "barista"],
  ["513425", "copeiro"],
  ["513605", "churrasqueiro"],
  ["513610", "pizzaiolo"],
  ["513615", "sushiman"],
  ["848305", "padeiro"],
  ["848310", "confeiteiro"],
  ["848510", "açougueiro"],
  ["521125", "repositor"],
  ["421125", "operador de caixa"],
  ["521110", "vendedor"],
  ["521115", "promotor de vendas"],
  ["521140", "atendente de loja"],
  ["521130", "atendente de farmácia"],
  ["517425", "fiscal de loja"],
  ["784105", "embalador"],
  ["422105", "recepcionista"],
  ["411005", "auxiliar administrativo"],
  ["411010", "assistente administrativo"],
  ["422310", "operador de telemarketing"],
  ["414105", "almoxarife"],
  ["414125", "estoquista"],
  ["414140", "auxiliar de logística"],
  ["414120", "conferente"],
  ["783210", "ajudante de carga e descarga"],
  ["782220", "operador de empilhadeira"],
  ["782510", "motorista de caminhão"],
  ["782410", "motorista de ônibus"],
  ["782310", "motorista entregador"],
  ["519110", "motoboy"],
  ["715210", "pedreiro"],
  ["717020", "servente de obras"],
  ["716610", "pintor"],
  ["715615", "eletricista"],
  ["724110", "encanador"],
  ["715505", "carpinteiro"],
  ["715315", "armador"],
  ["724440", "serralheiro"],
  ["514320", "faxineira"],
  ["512120", "diarista"],
  ["512105", "empregada doméstica"],
  ["514120", "zelador"],
  ["513315", "camareira"],
  ["516305", "lavadeira"],
  ["516210", "cuidador de idosos"],
  ["516205", "babá"],
  ["322205", "técnico de enfermagem"],
  ["322230", "auxiliar de enfermagem"],
  ["516120", "manicure"],
  ["516110", "cabeleireiro"],
  ["516105", "barbeiro"],
  ["322130", "esteticista"],
  ["784205", "auxiliar de produção"],
  ["724315", "soldador"],
  ["763215", "costureira"],
  ["517410", "porteiro"],
  ["517420", "vigia"],
  ["517330", "vigilante"],
  ["914405", "mecânico"],
  ["519935", "lavador de carros"],
  ["521135", "frentista"],
  ["992115", "borracheiro"],
  ["622010", "jardineiro"],
  ["514330", "piscineiro"],
  ["514310", "auxiliar de manutenção"],
];

export const FUNCOES_DAS_PAGINAS: FuncaoDaPagina[] = LISTA.map(([cbo, nome]) => ({
  cbo,
  slug: slugDaCidade(nome),
  nome,
}));

const POR_SLUG = new Map(FUNCOES_DAS_PAGINAS.map((f) => [f.slug, f]));
const POR_CBO = new Map(FUNCOES_DAS_PAGINAS.map((f) => [f.cbo, f]));

/** A função da lista pelo slug ("frentista"), ou null. */
export function funcaoDaListaPeloSlug(slug: string) {
  return POR_SLUG.get(slug) ?? null;
}

/** A função da lista pelo código da CBO, ou null. */
export function funcaoDaListaPeloCbo(cbo: string | null | undefined) {
  return cbo ? (POR_CBO.get(cbo) ?? null) : null;
}

/** /vagas/goiania/frentista */
export function caminhoDaFuncao(cidade: string, slugDaFuncao: string) {
  return `/vagas/${slugDaCidade(cidade)}/${slugDaFuncao}`;
}

/** "Vagas de frentista em Goiânia" (o h1). */
export function tituloDaFuncao(nome: string, cidade: string) {
  return `Vagas de ${nome} em ${cidade}`;
}

/** "Frentista" (a primeira letra maiúscula, para o começo de frase). */
export function comMaiuscula(nome: string) {
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
