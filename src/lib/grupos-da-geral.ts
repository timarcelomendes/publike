import { limparNomeDaCbo, buscaProibida, limparBusca } from "./impulso";

// Os grupos da campanha geral por função e por cidade (claude/plano-palavras-chave-pelas-funcoes.md; 14/11/2026,
// Marcelo: "eu quero que funcione assim", "campanha propria já fizemos e nao deu certo", "Sempre o valor da diferenca do
// impulsionado - valor da campanha", "sim, por cidade", "capricha"). As regras puras: quantos grupos cabem, quais entram,
// as palavras e o texto do anúncio de cada um. O robô (src/lib/servidor/grupos-da-geral.ts) leva ao Google.

export type TipoDoGrupo = "funcao" | "cidade";

/** Uma função ou cidade com vaga no ar, candidata a grupo. */
export type Candidato = {
  tipo: TipoDoGrupo;
  /** a CBO da função ou o nome da cidade */
  chave: string;
  /** como aparece no anúncio: "auxiliar de cozinha", "Aparecida de Goiânia" */
  nome: string;
  /** o caminho da página para onde o anúncio leva */
  pagina: string;
  vagas: number;
  impulsionadas: number;
  /** os outros nomes da função (os da CBO, já limpos), para as palavras */
  sinonimos?: string[];
};

/** A verba mínima por grupo, por dia (13/11/2026: "menos de R$ 10,00 por dia não vale a pena"). */
export const VERBA_MINIMA_DO_GRUPO = 10;
/** Até quantas palavras por grupo (o resto a IA não completa). */
export const PALAVRAS_POR_GRUPO = 15;

/**
 * Quantos grupos cabem: a diferença que os pacotes põem na campanha (o orçamento de agora menos a base, que fica com as
 * buscas gerais), dividida pela verba de cada grupo. Sem pacote no ar, nenhum.
 */
export function gruposQueCabem(alvo: number, base: number, verba: number) {
  const v = Math.max(verba, VERBA_MINIMA_DO_GRUPO);
  return Math.max(0, Math.floor((Math.round((alvo - base) * 100) / 100 + 1e-9) / v));
}

/**
 * Quais entram: a função ou cidade com vaga impulsionada primeiro (o dinheiro veio dela), depois as com mais vagas no
 * ar (com pelo menos `entrada`); no empate, a que já está ligada fica (para não trocar à toa) e depois o nome.
 */
export function escolherGrupos(
  candidatos: Candidato[],
  cabem: number,
  entrada: number,
  ligados: Set<string> = new Set(),
): Candidato[] {
  const chave = (c: Candidato) => `${c.tipo}:${c.chave}`;
  return candidatos
    .filter((c) => c.impulsionadas > 0 || c.vagas >= entrada)
    .sort(
      (x, y) =>
        Number(y.impulsionadas > 0) - Number(x.impulsionadas > 0) ||
        y.impulsionadas - x.impulsionadas ||
        y.vagas - x.vagas ||
        Number(ligados.has(chave(y))) - Number(ligados.has(chave(x))) ||
        x.nome.localeCompare(y.nome, "pt-BR"),
    )
    .slice(0, Math.max(0, cabem));
}

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Mn}/gu, "");
const PRIMEIRA = (t: string) => t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
/** "auxiliar de cozinha" → "Auxiliar de Cozinha" (as ligações em minúsculas). */
export function emTitulo(t: string) {
  const ligacoes = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"]);
  return t
    .split(" ")
    .map((p, i) => (i > 0 && ligacoes.has(p.toLowerCase()) ? p.toLowerCase() : PRIMEIRA(p)))
    .join(" ");
}

/** As palavras que trazem quem não procura vaga, negativas em todo grupo de função. */
export const NEGATIVAS_DE_SEMPRE = [
  "curso",
  "cursos",
  "concurso",
  "apostila",
  "o que faz",
  "como ser",
  "como se tornar",
  "piso salarial",
  "uniforme",
  "dolma",
  "pdf",
  "modelo de curriculo",
];

/** As palavras de um grupo, sem repetir, limpas e dentro da regra, até `limite`. */
export function juntarPalavras(listas: string[][], limite = PALAVRAS_POR_GRUPO) {
  const saida: string[] = [];
  const vistas = new Set<string>();
  for (const lista of listas)
    for (const t of lista) {
      const p = limparBusca(t);
      if (!p || buscaProibida(p)) continue;
      const k = semAcento(p);
      if (vistas.has(k)) continue;
      vistas.add(k);
      saida.push(p);
      if (saida.length >= limite) return saida;
    }
  return saida;
}

/** As palavras de base do grupo (sem a IA): a função e os outros nomes dela, ou a cidade, com "vaga" e "emprego". */
export function palavrasDeBase(c: Candidato): string[] {
  if (c.tipo === "cidade") {
    const cidade = c.nome.toLowerCase();
    // "Aparecida de Goiânia" também se busca só "aparecida"
    const curta = cidade.split(" de ")[0];
    return juntarPalavras([
      [
        `vagas ${cidade}`,
        `vagas de emprego ${cidade}`,
        `emprego ${cidade}`,
        `empregos em ${cidade}`,
        `vagas em ${cidade}`,
        `trabalho em ${cidade}`,
        `vagas de emprego em ${cidade} hoje`,
      ],
      curta !== cidade && curta.length >= 5 ? [`vagas ${curta}`, `emprego ${curta}`, `vagas de emprego ${curta}`] : [],
    ]);
  }
  const f = c.nome.toLowerCase();
  const outros = (c.sinonimos ?? []).filter((s) => semAcento(s) !== semAcento(f)).slice(0, 4);
  return juntarPalavras([
    [f, `vaga de ${f}`, `vagas de ${f}`, `emprego de ${f}`, `vaga ${f} goiânia`, `${f} goiânia`],
    outros.map((s) => `vaga de ${s}`),
  ]);
}

/** Os nomes da função na CBO, limpos (o oficial e os sinônimos), como as palavras usam. */
export function sinonimosDaCbo(nomes: (string | null | undefined)[]) {
  return [...new Set(nomes.filter((n): n is string => Boolean(n)).flatMap(limparNomeDaCbo))];
}

export type TextoDoGrupo = { titulos: string[]; descricoes: string[]; caminho1: string; caminho2: string };

const ate = (n: number) => (t: string) => t.length <= n;
/** Um pedaço do endereço do anúncio ("publike.org/vagas/cozinha"): sem acento, até 15 letras. */
function pedacoDoCaminho(t: string) {
  const palavras = semAcento(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((p) => p && !["de", "da", "do", "e", "em"].includes(p));
  const saida: string[] = [];
  for (const p of palavras) {
    if ([...saida, p].join("-").length > 15) break;
    saida.push(p);
  }
  return saida.join("-") || (palavras[0] ?? "vagas").slice(0, 15);
}

/**
 * O anúncio do grupo: sem número de vagas (o número muda todo dia e o anúncio não), só o que vale sempre. Títulos até 30
 * letras (de 3 a 15) e descrições até 90 (de 2 a 4), como o Google pede.
 */
export function textoDoGrupo(c: Candidato): TextoDoGrupo {
  const comuns = ["Curta a vaga e se candidate", "Grátis para quem procura", "Vagas perto de você"];
  if (c.tipo === "cidade") {
    const C = c.nome;
    // "Aparecida de Goiânia" também é "Aparecida" (os títulos têm até 30 letras)
    const curta = C.split(" de ")[0];
    const titulos = [
      `Vagas em ${C}`,
      `Emprego em ${C}`,
      `Vagas de emprego em ${C}`,
      `Trabalho em ${C}`,
      ...(curta !== C ? [`Vagas em ${curta}`, `Emprego em ${curta}`, `Vagas de emprego em ${curta}`] : []),
      ...comuns,
    ];
    const descricoes = [
      `Vagas de emprego em ${C}: veja o salário e o bairro de cada uma e se candidate.`,
      `Vagas em ${C}: veja o salário e o bairro de cada uma.`,
      `Vagas em ${C} e região. Curta a vaga; deu match, vocês conversam.`,
      "Curta a vaga e a empresa vê seu perfil. Grátis para quem procura emprego.",
    ];
    return {
      titulos: [...new Set(titulos.filter(ate(30)))].slice(0, 15),
      descricoes: [...new Set(descricoes.filter(ate(90)))].slice(0, 4),
      caminho1: "vagas",
      caminho2: pedacoDoCaminho(C),
    };
  }
  const F = emTitulo(c.nome);
  const titulos = [
    `Vagas de ${F}`,
    `Vaga de ${F}`,
    `${F} em Goiânia`,
    `${F}: vagas no ar`,
    `Emprego de ${F}`,
    F,
    "Vagas em Goiânia e região",
    ...comuns,
  ];
  const f = c.nome.toLowerCase();
  const descricoes = [
    `Vagas de ${f} em Goiânia e região: veja o salário e o bairro de cada uma.`,
    `Procura vaga de ${f}? Curta a vaga; deu match, vocês conversam.`,
    "Vagas em Goiânia e região. Curta a vaga e se candidate, grátis.",
    "Curta a vaga e a empresa vê seu perfil. Grátis para quem procura emprego.",
  ];
  return {
    titulos: [...new Set(titulos.filter(ate(30)))].slice(0, 15),
    descricoes: [...new Set(descricoes.filter(ate(90)))].slice(0, 4),
    caminho1: "vagas",
    caminho2: pedacoDoCaminho(c.nome),
  };
}

/** O nome do grupo no Google: "Função · Auxiliar de Cozinha", "Cidade · Aparecida de Goiânia". */
export function nomeDoGrupo(c: Pick<Candidato, "tipo" | "nome">) {
  return `${c.tipo === "cidade" ? "Cidade" : "Função"} · ${emTitulo(c.nome)}`.slice(0, 255);
}
