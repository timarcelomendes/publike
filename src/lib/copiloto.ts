// O copiloto de contratação (teste; migração 20261203120000): os critérios da vaga, a leitura de
// cada currículo contra eles (com o trecho como prova) e as travas. Vale no navegador e no servidor.

export type CriterioCopiloto = { id: string; texto: string; obrigatorio: boolean };
export type ResultadoCriterio = "atende" | "nao_atende" | "sem_info";
export type LeituraCriterio = { id: string; resultado: ResultadoCriterio; trecho: string; explicacao: string };
export type LeituraCopiloto = { criterios: LeituraCriterio[]; resumo: string; perguntas: string[] };
export type OrigemCopiloto = "talento" | "candidato";

export const MAX_CRITERIOS = 8;
/** quantos currículos cada chamada lê (3 de cada vez) */
export const LOTE_COPILOTO = 6;
/** quantos currículos cada clique em "Buscar profissionais" lê */
export const POR_CLIQUE_COPILOTO = 24;
export const LIMITE_DIA_COPILOTO = 300;

export const SEM_PROVA = "A IA não achou isso no currículo: confira na entrevista.";

// O que a lei não deixa usar para escolher (Lei 9.029/1995) e o que o currículo não mostra. A mesma
// lista de privado.copiloto_criterio_proibido.
const PROIBIDOS: [RegExp, string][] = [
  [
    /\bidade\b|\b\d{2} ?(a|e|até) ?\d{2} anos|\b(até|acima de|maior de|menor de) \d{2} anos|\bjove(m|ns)\b/i,
    "Idade não entra: o currículo não mostra e a lei não deixa escolher por idade. Se a vaga exige 18 anos, diga na descrição.",
  ],
  [/\bsexo\b|g[eê]nero|\bhomens?\b|\bmulher(es)?\b|masculin|feminin/i, "Sexo e gênero não entram nos critérios."],
  [
    /(?<!venda )\bcasad[oa]s?\b|solteir|estado civil|\bfilhos?\b|gr[aá]vida|gravidez|gestante/i,
    "Estado civil, filhos e gravidez não entram nos critérios.",
  ],
  [/apar[eê]ncia|\bfotos?\b/i, "Aparência e foto não entram nos critérios."],
  [
    /religi|cor da pele|\bra[cç]a\b|orienta[cç][aã]o sexual|nacionalidade/i,
    "Isso não entra nos critérios: a lei não deixa escolher por isso.",
  ],
  [/defici[eê]n|\bpcd\b/i, "Deficiência e saúde não entram. Vaga só para PcD? Diga na descrição da vaga."],
  [/nome limpo|\bspc\b|serasa|antecedentes/i, "Nome limpo e antecedentes não entram: o currículo não mostra."],
];

/** Por que o critério não pode, ou null se pode. */
export function motivoProibido(texto: string): string | null {
  for (const [re, motivo] of PROIBIDOS) if (re.test(texto)) return motivo;
  return null;
}

/** Minúsculas, sem acento, sem pontuação e com um espaço só: para conferir o trecho no currículo. */
export function normalizar(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** O trecho que a IA citou está mesmo no currículo? */
export function trechoNoTexto(trecho: string, texto: string) {
  const t = normalizar(trecho);
  return t.length >= 4 && ` ${normalizar(texto)} `.includes(` ${t} `);
}

export type AvaliacaoCopiloto = {
  perfil_id: string;
  origem: OrigemCopiloto;
  versao: string;
  curriculo_em: string;
  leitura: LeituraCopiloto;
  atende: number;
  obrigatorios_ok: boolean;
};

/** A leitura guardada no banco (jsonb), só com o que tem forma de leitura. */
export function leituraDoBanco(valor: unknown): LeituraCopiloto {
  const o = (valor ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    criterios: (Array.isArray(o.criterios) ? o.criterios : []).map((c) => {
      const k = (c ?? {}) as Record<string, unknown>;
      const r = k.resultado === "atende" || k.resultado === "nao_atende" ? k.resultado : "sem_info";
      return { id: texto(k.id), resultado: r, trecho: texto(k.trecho), explicacao: texto(k.explicacao) };
    }),
    resumo: texto(o.resumo),
    perguntas: (Array.isArray(o.perguntas) ? o.perguntas : []).filter((p): p is string => typeof p === "string"),
  };
}

/**
 * O grupo no ranking: 0 atende todos os obrigatórios (ou a vaga não tem obrigatório), 1 falta conferir um
 * obrigatório (a IA não achou no currículo), 2 não atende um obrigatório.
 */
export type GrupoDoRanking = 0 | 1 | 2;

/** Os números da leitura para os critérios de agora: o que atende, a nota do ranking e os obrigatórios que faltam. */
export function contarLeitura(criterios: CriterioCopiloto[], leitura: LeituraCopiloto) {
  const de = new Map(leitura.criterios.map((c) => [c.id, c.resultado]));
  const atende = criterios.filter((c) => de.get(c.id) === "atende").length;
  const naoAtende = criterios.filter((c) => de.get(c.id) === "nao_atende").length;
  const conferir = criterios.length - atende - naoAtende;
  const obrigatorios = criterios.filter((c) => c.obrigatorio);
  const obrigatoriosOk = obrigatorios.length > 0 && obrigatorios.every((c) => de.get(c.id) === "atende");
  // os obrigatórios que não atende e os que falta conferir, para o ranking dizer o porquê
  const faltam = obrigatorios.filter((c) => de.get(c.id) === "nao_atende").map((c) => c.texto);
  const aConferir = obrigatorios.filter((c) => (de.get(c.id) ?? "sem_info") === "sem_info").map((c) => c.texto);
  const grupo: GrupoDoRanking = faltam.length ? 2 : aConferir.length ? 1 : 0;
  // a nota (0 a 100): o obrigatório vale o dobro; "conferir" conta a metade
  const peso = (c: CriterioCopiloto) => (c.obrigatorio ? 2 : 1);
  const valor = (c: CriterioCopiloto) => {
    const r = de.get(c.id) ?? "sem_info";
    return r === "atende" ? 1 : r === "nao_atende" ? 0 : 0.5;
  };
  const total = criterios.reduce((s, c) => s + peso(c), 0);
  const nota = total ? Math.round((100 * criterios.reduce((s, c) => s + peso(c) * valor(c), 0)) / total) : 0;
  return {
    atende,
    naoAtende,
    conferir,
    obrigatorios: obrigatorios.length,
    obrigatoriosOk,
    faltam,
    aConferir,
    grupo,
    nota,
  };
}

export type NumerosDaLeitura = ReturnType<typeof contarLeitura>;

/**
 * A ordem do ranking: primeiro quem atende todos os obrigatórios, depois quem só tem obrigatório para conferir,
 * por último quem não atende um obrigatório; dentro de cada grupo, a nota, quem atende mais, quem tem menos
 * "não atende" e, no empate, a pré-nota sem IA.
 */
export function compararLeituras(
  a: Pick<NumerosDaLeitura, "grupo" | "nota" | "atende" | "naoAtende"> & { preNota: number },
  b: Pick<NumerosDaLeitura, "grupo" | "nota" | "atende" | "naoAtende"> & { preNota: number },
) {
  return (
    a.grupo - b.grupo || b.nota - a.nota || b.atende - a.atende || a.naoAtende - b.naoAtende || b.preNota - a.preNota
  );
}

/** Os critérios que vieram do banco (jsonb). */
export function criteriosDoBanco(valor: unknown): CriterioCopiloto[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .flatMap((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return typeof o.id === "string" && typeof o.texto === "string"
        ? [{ id: o.id, texto: o.texto, obrigatorio: o.obrigatorio === true }]
        : [];
    })
    .slice(0, MAX_CRITERIOS);
}

export type LinhaRegistro = {
  acao: string;
  quantos: number;
  detalhe: string | null;
  quem: string | null;
  convidado: string | null;
};

/** Uma linha de "O que o copiloto fez". */
export function textoDoRegistro(r: LinhaRegistro) {
  const n = r.quantos;
  let t: string;
  if (r.acao === "criterios" && r.detalhe?.startsWith("automatico")) {
    // os critérios que a IA montou sozinha pela vaga (migração 20261227120000)
    t = `A IA montou ${n} ${n === 1 ? "critério" : "critérios"} pela vaga`;
  } else if (r.acao === "criterios") {
    const obrig = Number(r.detalhe ?? 0);
    t = `Salvou ${n} ${n === 1 ? "critério" : "critérios"}${obrig ? ` (${obrig} ${obrig === 1 ? "obrigatório" : "obrigatórios"})` : ""}`;
  } else if (r.acao === "avaliou" && r.detalhe === "automatico") {
    t = `Leu sozinha ${n} ${n === 1 ? "candidatura" : "candidaturas"}`;
  } else if (r.acao === "avaliou") {
    t = `Leu ${n} ${n === 1 ? "currículo" : "currículos"} de ${r.detalhe === "candidato" ? "candidatos" : "Talentos"}`;
  } else if (r.acao === "convidou") {
    t = `Convidou ${r.convidado ?? "uma pessoa"} para a vaga`;
  } else {
    const partes = (r.detalhe ?? "").split(",");
    const ligadas = [
      partes.includes("busca") && "a busca em Talentos",
      partes.includes("triagem") && "a leitura dos candidatos",
    ]
      .filter(Boolean)
      .join(" e ");
    t = ligadas ? `Deixou ligada ${ligadas}` : "Desligou a busca e a leitura dos candidatos";
    if (partes.includes("padrao")) t += " (padrão das próximas vagas)";
  }
  return r.quem ? `${r.quem}: ${t}` : t;
}
