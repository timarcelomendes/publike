import "server-only";
import dados from "./cbo/ocupacoes.json";

// A Classificação Brasileira de Ocupações (CBO 2002, do Ministério do Trabalho): o código de 6 dígitos que o Novo
// Caged usa em cada contratação, o nome oficial e os sinônimos ("Auxiliar de cozinha" é 513505, "Auxiliar nos
// serviços de alimentação"). Só no servidor: o arquivo tem ~380 kB. Fonte: os arquivos "CBO2002 - Ocupacao.csv" e
// "CBO2002 - Sinonimo.csv" da página de downloads da CBO (gov.br/trabalho-e-emprego, assuntos/cbo).

export type Ocupacao = { cbo: string; nome: string; sinonimos: string[] };

const OCUPACOES: Ocupacao[] = (dados.ocupacoes as unknown as [string, string, string[]?][]).map(
  ([cbo, nome, sinonimos]) => ({ cbo, nome, sinonimos: sinonimos ?? [] }),
);
const POR_CBO = new Map(OCUPACOES.map((o) => [o.cbo, o]));

/** A ocupação de um código CBO (6 dígitos), ou null. */
export function ocupacao(cbo: string | null | undefined): Ocupacao | null {
  return (cbo && POR_CBO.get(cbo)) || null;
}

/** "Auxiliar nos Serviços de Alimentação" → "auxiliar nos servicos de alimentacao" (sem acento e sem pontuação). */
export function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SEM_PESO = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "a", "o", "as", "os", "com", "no", "na"]);
/** Palavras que aparecem em centenas de ocupações ("auxiliar de cozinha" não é "auxiliar de topógrafo"). */
const GENERICAS = new Set(["auxiliar", "ajudante", "assistente", "operador", "tecnico", "trabalhador", "agente"]);

function palavras(texto: string) {
  return normalizarTexto(texto)
    .split(" ")
    .filter((p) => p.length > 1 && !SEM_PESO.has(p));
}

/** A palavra sem a ponta de gênero e de plural: "faxineira" e "faxineiros" → "faxineir". */
function raiz(p: string) {
  return p.length > 4 ? p.replace(/(oes|aes|os|as|es|o|a|e|s)$/, "") : p;
}

/** Plural, singular e gênero ("atendentes", "faxineira"/"faxineiro") contam como a mesma palavra. */
function mesmaPalavra(a: string, b: string) {
  if (a === b || raiz(a) === raiz(b)) return true;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  return curta.length >= 4 && longa.startsWith(curta) && longa.length - curta.length <= 2;
}

// os textos de cada ocupação (o nome e os sinônimos), já em palavras
const TEXTOS = OCUPACOES.map((o) => ({
  o,
  textos: [o.nome, ...o.sinonimos].map((t) => ({ texto: t, palavras: palavras(t), normal: normalizarTexto(t) })),
}));

export type OcupacaoAchada = Ocupacao & { pontos: number; pelo: string };

/**
 * As ocupações que mais parecem com o texto (um título de vaga, o "O que você faz", uma busca do admin), da que
 * mais parece para a que menos. `pelo`: o nome ou o sinônimo que bateu. Precisa bater pelo menos metade das
 * palavras do texto; o texto inteiro igual ao nome ou a um sinônimo vem primeiro.
 */
export function buscarOcupacoes(texto: string, limite = 10): OcupacaoAchada[] {
  const busca = palavras(texto);
  if (!busca.length) return [];
  const inteiro = normalizarTexto(texto);
  const achadas: OcupacaoAchada[] = [];
  for (const { o, textos } of TEXTOS) {
    let melhor: { pontos: number; pelo: string } | null = null;
    for (const t of textos) {
      if (!t.palavras.length) continue;
      const iguais = busca.filter((p) => t.palavras.some((q) => mesmaPalavra(p, q)));
      const batem = iguais.length;
      const cobre = batem / busca.length;
      if (cobre < 0.5) continue;
      // com palavra própria no texto ("cozinha"), ela precisa bater: só "auxiliar" não basta
      if (busca.some((p) => !GENERICAS.has(p)) && iguais.every((p) => GENERICAS.has(p))) continue;
      const pontos = cobre + (0.5 * batem) / t.palavras.length + (t.normal === inteiro ? 1 : 0);
      if (!melhor || pontos > melhor.pontos) melhor = { pontos, pelo: t.texto };
    }
    if (melhor) achadas.push({ ...o, ...melhor });
  }
  return achadas
    .sort((a, b) => b.pontos - a.pontos || a.nome.length - b.nome.length)
    .slice(0, Math.max(1, Math.min(limite, 50)));
}

/**
 * As ocupações cujo nome (ou sinônimo) aparece inteiro num texto longo: a descrição de uma vaga, o "o que você fazia"
 * de uma experiência (claude/plano-match-pelo-contexto.md). O contrário de `buscarOcupacoes`, que precisa do texto
 * curto. Ocupação de uma palavra só, ou só de palavras genéricas, não conta (diz pouco num texto longo).
 */
export function ocupacoesNoTexto(texto: string, limite = 8): OcupacaoAchada[] {
  const doTexto = palavras(texto.slice(0, 1500));
  if (doTexto.length < 2) return [];
  const raizes = new Set(doTexto.map(raiz));
  const inteiro = normalizarTexto(texto.slice(0, 1500));
  const achadas: OcupacaoAchada[] = [];
  for (const { o, textos } of TEXTOS) {
    let melhor: { pontos: number; pelo: string } | null = null;
    for (const t of textos) {
      if (t.palavras.length < 2 || t.palavras.every((p) => GENERICAS.has(p))) continue;
      if (!t.palavras.every((p) => raizes.has(raiz(p)) || doTexto.some((q) => mesmaPalavra(p, q)))) continue;
      const pontos = t.palavras.length + (inteiro.includes(t.normal) ? 2 : 0);
      if (!melhor || pontos > melhor.pontos) melhor = { pontos, pelo: t.texto };
    }
    if (melhor) achadas.push({ ...o, ...melhor });
  }
  return achadas
    .sort((a, b) => b.pontos - a.pontos || a.nome.length - b.nome.length)
    .slice(0, Math.max(1, Math.min(limite, 30)));
}
