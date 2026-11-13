import "server-only";
import { REGIMES, nomeJornada } from "@/lib/constantes";
import { funcaoDoTitulo, limparRevisao, salarioDaVaga, type RevisaoDasPalavras, type VagaDoImpulso } from "@/lib/impulso";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import type { Regime } from "@/lib/tipos";
import type { acessoFila } from "./filas";

// A IA no ato de impulsionar (13/11/2026, pedido do Marcelo: "a IA olhar e ver se tem oportunidade de melhorar... isso é
// padrão"): uma vez por impulso, ela lê a vaga e as buscas que o Publike montou (`buscasDaVaga`) e devolve o que
// falta, o que traz gente errada e as palavras negativas do grupo. O robô (impulsos.ts) guarda e aplica.

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

const SISTEMA = `Você cuida das palavras-chave do Google Ads de uma vaga de emprego impulsionada pelo Publike, um site de vagas de Goiânia e região (Goiás, Brasil). O anúncio aparece na pesquisa do Google só para quem está perto da vaga (o lugar já é o raio em volta dela), e as palavras são de correspondência ampla: o Google já pega plural, sem acento e erro de digitação.

Você recebe a vaga e a lista de buscas que o Publike montou: a função do título, os nomes oficiais da CBO, as funções parecidas e as buscas largas de emprego. Melhore a lista para trazer mais gente certa para esta vaga:
- acrescentar: até 30 buscas que quem procura este trabalho digita e que faltam na lista: o nome popular da função em Goiás, o jeito de falar do dia a dia ("chapa", "ajudante geral"), funções equivalentes que a pessoa toparia, a busca com a cidade ou o bairro. Escreva como as pessoas buscam, em minúsculas, até 8 palavras, com "vaga", "emprego" ou "trabalho"; ou só o nome da função, que o Publike completa com "vaga de".
- tirar: buscas da lista que trazem gente errada para esta vaga (outra função, outro nível de experiência, sentido duplo). Copie exatamente como está na lista. Não tire as três primeiras: são a função do título.
- negativas: até 15 palavras curtas (de 1 a 3) que aparecem em buscas que não são de quem procura esta vaga (por exemplo, para carregador: "celular", "bateria", "usb"). Nunca a própria função nem "vaga", "emprego" ou "trabalho".

Regras que não mudam:
- Nada de idade, sexo, gênero, cor, religião, estado civil, gravidez, deficiência ou aparência (Lei 9.029/1995 e CLT, art. 373-A). "Jovem aprendiz" é o nome do contrato e pode.
- Nada de nome de empresa, de outro site de vagas ou de órgão público.
- Nada que prometa o que a vaga não diz.
Para cada item, diga o porquê em até 12 palavras. Se a lista já está boa, devolva listas vazias.`;

const ITEM = (campo: string) => ({
  type: "array",
  items: {
    type: "object",
    properties: { [campo]: { type: "string" }, porque: { type: "string" } },
    required: [campo, "porque"],
    additionalProperties: false,
  },
});

const ESQUEMA = {
  type: "object",
  properties: { acrescentar: ITEM("busca"), tirar: ITEM("busca"), negativas: ITEM("palavra") },
  required: ["acrescentar", "tirar", "negativas"],
  additionalProperties: false,
};

/** O que o robô guarda no impulso: o que valeu, o porquê de cada item, o modelo e quando (ou o erro). */
export type RevisaoGuardada = RevisaoDasPalavras & {
  porque?: Record<string, string>;
  modelo?: string;
  em: string;
  erro?: string;
};

/** O modelo da IA para o impulso, ou null: sem a chave da IA ou com a IA desligada no Admin. */
export async function modeloDoImpulso(a: Acesso): Promise<string | null> {
  if (!iaConfigurada()) return null;
  const { data } = await a.cliente.rpc("config_publica");
  const c = data?.[0];
  return c?.ia_melhorar_texto ? modeloPara(c, "impulso") : null;
}

function descrever(v: VagaDoImpulso, descricao: string) {
  const sal = salarioDaVaga(v);
  return [
    `Título: ${v.titulo}`,
    `Função: ${funcaoDoTitulo(v.titulo)}`,
    v.regime ? `Contratação: ${REGIMES[v.regime as Regime]?.nome ?? v.regime}` : null,
    v.jornada ? `Horário: ${nomeJornada(v.jornada) ?? v.jornada}` : null,
    sal ? `Pagamento: ${sal}` : null,
    v.vagas && v.vagas > 1 ? `Vagas: ${v.vagas}` : null,
    `Local: ${v.bairro}, ${v.cidade} (GO)`,
    descricao ? `Descrição: ${descricao.replace(/\s+/g, " ").slice(0, 800)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A revisão da IA para a vaga: chama a IA uma vez, confere a resposta (`limparRevisao`) e devolve para guardar. Com
 * erro da IA, devolve o erro (guardado também, para não chamar a cada medida).
 */
export async function revisarComIA(
  modelo: string,
  v: VagaDoImpulso,
  descricao: string,
  lista: string[],
  protegidas: string[],
): Promise<RevisaoGuardada> {
  const em = new Date().toISOString();
  try {
    const { texto, parada } = await chamarIA({
      funcionalidade: "impulso",
      modelo,
      sistema: SISTEMA,
      mensagem: `<vaga>\n${descrever(v, descricao)}\n</vaga>\n\n<lista>\n${lista.join("\n")}\n</lista>`,
      maxTokens: 2500,
      esquema: { nome: "palavras_do_impulso", schema: ESQUEMA },
      tempoLimite: 30_000,
    });
    if (parada) return { acrescentar: [], tirar: [], negativas: [], modelo, em, erro: `A IA parou (${parada}).` };
    const bruta = lerJson<{ acrescentar?: unknown; tirar?: unknown; negativas?: unknown }>(texto);
    const r = limparRevisao(bruta, lista, protegidas);
    // o porquê de cada item que valeu (para o Admin mostrar)
    const porque: Record<string, string> = {};
    for (const [campo, chave] of [
      ["acrescentar", "busca"],
      ["tirar", "busca"],
      ["negativas", "palavra"],
    ] as const) {
      for (const i of Array.isArray(bruta[campo]) ? (bruta[campo] as Record<string, unknown>[]) : []) {
        const k = typeof i?.[chave] === "string" ? (i[chave] as string).toLowerCase().trim() : "";
        if (k && typeof i.porque === "string") porque[k] = i.porque.slice(0, 120);
      }
    }
    return { ...r, porque, modelo, em };
  } catch (e) {
    return { acrescentar: [], tirar: [], negativas: [], modelo, em, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
