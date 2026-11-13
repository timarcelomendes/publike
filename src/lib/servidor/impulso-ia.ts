import "server-only";
import { REGIMES, nomeJornada } from "@/lib/constantes";
import {
  funcaoDoTitulo,
  limparRevisao,
  salarioDaVaga,
  type RevisaoDasPalavras,
  type VagaDoImpulso,
} from "@/lib/impulso";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import type { Regime } from "@/lib/tipos";
import type { acessoFila } from "./filas";

// A IA no ato de impulsionar (13/11/2026, pedido do Marcelo: "a IA olhar e ver se tem oportunidade de melhorar... isso é
// padrão"): uma vez por impulso, ela lê a vaga e as buscas que o Publike montou (`buscasDaVaga`) e devolve o que
// falta, o que traz gente errada e as palavras negativas do grupo. O robô (impulsos.ts) guarda e aplica.
// No ajuste diário (impulso-ajuste.ts), ela lê as buscas de verdade de quem viu o anúncio e diz quais tirar.

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

const SISTEMA = `Você cuida das palavras-chave do Google Ads de uma vaga de emprego impulsionada pelo Publike, um site de vagas de Goiânia e região (Goiás, Brasil). O anúncio aparece na pesquisa do Google só para quem está perto da vaga (o lugar já é o raio em volta dela), e as palavras são de correspondência ampla: o Google já pega plural, sem acento e erro de digitação.

Você recebe a vaga e a lista de buscas que o Publike montou: a função do título, os nomes oficiais da CBO e as funções parecidas. Melhore a lista para trazer mais gente certa para esta vaga:
- acrescentar: até 30 buscas que quem procura este trabalho digita e que faltam na lista: o nome popular da função em Goiás, o jeito de falar do dia a dia ("chapa", "ajudante geral"), funções equivalentes que a pessoa toparia, a busca com a cidade ou o bairro. Escreva como as pessoas buscam, em minúsculas, até 8 palavras, com "vaga", "emprego" ou "trabalho"; ou só o nome da função, que o Publike completa com "vaga de".
- tirar: buscas da lista que trazem gente errada para esta vaga (outra função, outro nível de experiência, sentido duplo). Copie exatamente como está na lista. Não tire as três primeiras: são a função do título.
- negativas: até 15 palavras curtas (de 1 a 3) que aparecem em buscas que não são de quem procura esta vaga (por exemplo, para carregador: "celular", "bateria", "usb"). Nunca a própria função nem "vaga", "emprego" ou "trabalho".

Regras que não mudam:
- Nada de idade, sexo, gênero, cor, religião, estado civil, gravidez, deficiência ou aparência (Lei 9.029/1995 e CLT, art. 373-A). "Jovem aprendiz" é o nome do contrato e pode.
- Nada de nome de empresa, de outro site de vagas ou de órgão público.
- Nada de busca larga de emprego, sem a função ("vagas de emprego", "empregos goiânia", "procuro emprego", "vagas clt"): essas são da campanha geral do Publike, e o anúncio da vaga perde para ela.
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
  properties: {
    acrescentar: ITEM("busca"),
    tirar: ITEM("busca"),
    negativas: ITEM("palavra"),
  },
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
    v.regime
      ? `Contratação: ${REGIMES[v.regime as Regime]?.nome ?? v.regime}`
      : null,
    v.jornada ? `Horário: ${nomeJornada(v.jornada) ?? v.jornada}` : null,
    sal ? `Pagamento: ${sal}` : null,
    v.vagas && v.vagas > 1 ? `Vagas: ${v.vagas}` : null,
    `Local: ${v.bairro}, ${v.cidade} (GO)`,
    descricao
      ? `Descrição: ${descricao.replace(/\s+/g, " ").slice(0, 800)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------ o ajuste diário: as buscas de verdade

const SISTEMA_BUSCAS = `Você cuida dos anúncios de vagas de emprego do Publike, um site de vagas de Goiânia e região (Goiás, Brasil), na pesquisa do Google. O anúncio aparece só para quem está perto da vaga.

Para cada vaga, você recebe o que ela é e as buscas de verdade de quem viu o anúncio (quantas vezes ele apareceu e quantos clicaram). Diga quais buscas tirar: elas viram palavra negativa exata, e só aquela busca deixa de mostrar o anúncio desta vaga.

Tire a busca quando quem buscou não procura esta vaga:
- não procura emprego: curso, apostila, concurso, edital, produto, peça, preço, compra, aluguel, endereço ou telefone de empresa, notícia, significado, como fazer, programa de governo;
- procura um trabalho bem diferente, que não toparia: outra profissão (para uma vaga de movimentador, "vaga de enfermeira"), outro nível (gerente, para uma vaga de auxiliar), outra área;
- procura em outra cidade, longe de Goiânia e região.

Não tire:
- buscas de emprego em geral ("vagas de emprego", "emprego perto de mim", "estou procurando emprego"), com ou sem a cidade ou o bairro;
- a função da vaga, os nomes parecidos e as funções que a pessoa toparia (para movimentador: "chapa", "carregador", "ajudante de carga");
- jovem aprendiz, estágio, meio período, sem experiência ou primeiro emprego, se a vaga aceita.

Na dúvida, não tire. Copie a busca exatamente como veio e diga o porquê em até 12 palavras. Se nenhuma precisa sair, devolva a lista vazia.`;

const ESQUEMA_BUSCAS = {
  type: "object",
  properties: {
    fora: {
      type: "array",
      items: {
        type: "object",
        properties: {
          vaga: { type: "integer" },
          busca: { type: "string" },
          porque: { type: "string" },
        },
        required: ["vaga", "busca", "porque"],
        additionalProperties: false,
      },
    },
  },
  required: ["fora"],
  additionalProperties: false,
};

export type VagaParaJulgar = {
  vaga: VagaDoImpulso;
  descricao: string;
  buscas: { busca: string; impressoes: number; cliques: number }[];
};

/**
 * O ajuste diário: a IA lê as buscas de verdade de cada vaga da campanha (uma chamada para todas) e diz quais tirar.
 * Devolve o que ela disse (`vaga` é a posição na lista, de 1 em diante); quem chama confere cada busca. Com erro, o
 * erro (as buscas ficam para o dia seguinte).
 */
export async function julgarBuscasComIA(
  modelo: string,
  vagas: VagaParaJulgar[],
): Promise<{
  fora: { vaga: number; busca: string; porque: string }[];
  erro?: string;
}> {
  const plural = (n: number, um: string, varios: string) =>
    `${n} ${n === 1 ? um : varios}`;
  const mensagem = vagas
    .map(
      (x, n) =>
        `<vaga n="${n + 1}">\n${descrever(x.vaga, x.descricao)}\nBuscas:\n${x.buscas
          .map(
            (b) =>
              `- ${b.busca} (${plural(b.impressoes, "vista", "vistas")}, ${plural(b.cliques, "clique", "cliques")})`,
          )
          .join("\n")}\n</vaga>`,
    )
    .join("\n\n");
  try {
    const { texto, parada } = await chamarIA({
      funcionalidade: "impulso",
      modelo,
      sistema: SISTEMA_BUSCAS,
      mensagem,
      maxTokens: 3000,
      esquema: { nome: "buscas_do_impulso", schema: ESQUEMA_BUSCAS },
      tempoLimite: 15_000,
    });
    if (parada) return { fora: [], erro: `A IA parou (${parada}).` };
    const bruta = lerJson<{ fora?: unknown }>(texto);
    const fora = (Array.isArray(bruta.fora) ? bruta.fora : [])
      .map((i) =>
        i && typeof i === "object" ? (i as Record<string, unknown>) : {},
      )
      .filter(
        (i) =>
          Number.isInteger(i.vaga) &&
          typeof i.busca === "string" &&
          typeof i.porque === "string",
      )
      .map((i) => ({
        vaga: Number(i.vaga),
        busca: String(i.busca),
        porque: String(i.porque).slice(0, 120),
      }));
    return { fora };
  } catch (e) {
    return {
      fora: [],
      erro: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    };
  }
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
    if (parada)
      return {
        acrescentar: [],
        tirar: [],
        negativas: [],
        modelo,
        em,
        erro: `A IA parou (${parada}).`,
      };
    const bruta = lerJson<{
      acrescentar?: unknown;
      tirar?: unknown;
      negativas?: unknown;
    }>(texto);
    const r = limparRevisao(bruta, lista, protegidas);
    // o porquê de cada item que valeu (para o Admin mostrar)
    const porque: Record<string, string> = {};
    for (const [campo, chave] of [
      ["acrescentar", "busca"],
      ["tirar", "busca"],
      ["negativas", "palavra"],
    ] as const) {
      for (const i of Array.isArray(bruta[campo])
        ? (bruta[campo] as Record<string, unknown>[])
        : []) {
        const k =
          typeof i?.[chave] === "string"
            ? (i[chave] as string).toLowerCase().trim()
            : "";
        if (k && typeof i.porque === "string")
          porque[k] = i.porque.slice(0, 120);
      }
    }
    return { ...r, porque, modelo, em };
  } catch (e) {
    return {
      acrescentar: [],
      tirar: [],
      negativas: [],
      modelo,
      em,
      erro: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    };
  }
}
