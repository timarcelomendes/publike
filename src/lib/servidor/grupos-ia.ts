import "server-only";
import { juntarPalavras, PALAVRAS_POR_GRUPO, type Candidato } from "@/lib/grupos-da-geral";
import { limparRevisao } from "@/lib/impulso";
import { chamarIA, lerJson } from "@/lib/ia/openai";

// A IA nos grupos da campanha geral (claude/plano-palavras-chave-pelas-funcoes.md; Marcelo: "sempre usar inteligencia
// para adicionar titulos correlatos"): uma vez por grupo, ela lê a função (ou a cidade) e as palavras de base e devolve
// os títulos parecidos que faltam e as negativas. As regras de src/lib/impulso.ts (`limparRevisao`) conferem tudo antes
// de ir ao Google; a IA só sugere.

const SISTEMA = `Você cuida das palavras-chave do Google Ads do Publike, um site de vagas de emprego de Goiânia e região (Goiás, Brasil). A campanha mostra o anúncio na pesquisa do Google para quem está na região, com palavras de correspondência ampla (o Google já pega plural, sem acento e erro de digitação).

Você recebe um grupo da campanha: uma FUNÇÃO (com os nomes oficiais da CBO) ou uma CIDADE, e as palavras que o Publike já montou. O anúncio do grupo leva para a página das vagas daquela função (ou daquela cidade).
- acrescentar: até 10 buscas que quem procura esse trabalho digita e que faltam: o nome popular da função em Goiás, os títulos correlatos que a pessoa também procura (por exemplo, para auxiliar de cozinha: "ajudante de cozinha", "auxiliar de cozinha industrial"), o jeito de falar do dia a dia. Para a cidade: como as pessoas chamam a cidade e o "vagas em ..." com ela. Em minúsculas, até 8 palavras, com "vaga", "emprego" ou "trabalho", ou só o nome da função.
- negativas: até 12 palavras curtas (de 1 a 3) que aparecem em buscas de quem não procura vaga desse trabalho (curso, uniforme, receita, o produto, a máquina). Nunca a própria função nem "vaga", "emprego" ou "trabalho".

Regras que não mudam:
- Nada de idade, sexo, gênero, cor, religião, estado civil, gravidez, deficiência ou aparência (Lei 9.029/1995 e CLT, art. 373-A). "Jovem aprendiz" é o nome do contrato e pode.
- Nada de nome de empresa, de outro site de vagas ou de órgão público.
- Para FUNÇÃO: nada de busca larga de emprego sem a função ("vagas de emprego", "empregos goiânia"): essas são do grupo geral.
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
  properties: { acrescentar: ITEM("busca"), negativas: ITEM("palavra") },
  required: ["acrescentar", "negativas"],
  additionalProperties: false,
};

export type PalavrasDoGrupo = { palavras: string[]; negativas: string[]; modelo: string | null; erro?: string };

/**
 * As palavras do grupo com a IA por cima das de base, já conferidas (a regra do que nunca entra, sem repetir, até 15).
 * Sem modelo ou com erro da IA, ficam as de base: o grupo não espera a IA.
 */
export async function palavrasDoGrupoComIA(
  modelo: string | null,
  c: Candidato,
  base: string[],
): Promise<PalavrasDoGrupo> {
  if (!modelo) return { palavras: base, negativas: [], modelo: null };
  try {
    const { texto, parada } = await chamarIA({
      funcionalidade: "impulso",
      modelo,
      sistema: SISTEMA,
      mensagem: [
        c.tipo === "cidade" ? `CIDADE: ${c.nome} (Goiás)` : `FUNÇÃO: ${c.nome}`,
        c.tipo === "funcao" && c.sinonimos?.length ? `Nomes na CBO: ${c.sinonimos.join("; ")}` : "",
        c.tipo === "funcao" && c.titulos?.length ? `Títulos das vagas no ar: ${c.titulos.join("; ")}` : "",
        `<lista>\n${base.join("\n")}\n</lista>`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxTokens: 1500,
      esquema: { nome: "palavras_do_grupo", schema: ESQUEMA },
      tempoLimite: 25_000,
    });
    if (parada) return { palavras: base, negativas: [], modelo, erro: `A IA parou (${parada}).` };
    const bruta = lerJson<{ acrescentar?: unknown; negativas?: unknown }>(texto);
    // a mesma conferência do impulso: limpa, sem o proibido, sem repetir, e as negativas que não tiram o grupo das
    // próprias buscas
    const r = limparRevisao({ acrescentar: bruta.acrescentar, tirar: [], negativas: bruta.negativas }, base, base);
    const palavras = juntarPalavras([base, r.acrescentar], PALAVRAS_POR_GRUPO);
    return { palavras, negativas: r.negativas.slice(0, 12), modelo };
  } catch (e) {
    return { palavras: base, negativas: [], modelo, erro: e instanceof Error ? e.message : String(e) };
  }
}
