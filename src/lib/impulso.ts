// O impulso da vaga (claude/plano-impulsionar-vaga.md): o texto do anúncio no Google, feito da vaga. Vale no navegador
// (a prévia na hora de comprar) e no servidor (o robô que cria o anúncio). Os limites do Google: títulos até 30 letras
// (de 3 a 15), descrições até 90 (de 2 a 4), palavras-chave até 80 letras e 10 palavras, caminhos até 15 letras.
// Nada de exclamação, de LETRA MAIÚSCULA de enfeite nem de referência a idade, sexo ou aparência (a lei e o Google).

import { REGIMES, nomeJornada } from "./constantes";
import { formatarMoeda } from "./formato";
import type { Regime } from "./tipos";

/** O utm_campaign do anúncio: a página da vaga reconhece quem chegou por ele. */
export const CAMPANHA_DO_IMPULSO = "impulso";

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
  palavras: string[];
  caminho1: string;
  caminho2: string;
};

const POR: Record<string, string> = { hora: "por hora", dia: "por dia", semana: "por semana", mes: "por mês" };

/** "AUXILIAR DE COZINHA (M/F) - URGENTE!" → "Auxiliar de cozinha": a função, sem enfeite. */
export function funcaoDoTitulo(titulo: string) {
  let t = titulo
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(urgente|contrata-se|contratamos|precisa-se|oportunidade)\b/gi, " ")
    .replace(/^\s*(vagas?|emprego)\s+(de|para|p\/)\s+/i, "")
    .replace(/[!?*#|]+/g, " ")
    .replace(/\s[-–—:]\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:\-–—]+$/, "")
    .trim();
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const maiusculas = t.replace(/[^A-ZÀ-Þ]/g, "");
  if (letras.length > 3 && maiusculas.length / letras.length > 0.6) t = t.toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Vaga de emprego";
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o"]);

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
  while (saida.length > 1 && LIGACOES.has(saida.at(-1)!.toLowerCase())) saida.pop();
  return saida.join(" ") || funcao.slice(0, max);
}

/** "R$ 2.300 a R$ 2.600" (ou só o valor); null sem salário. */
export function salarioDaVaga(v: VagaDoImpulso) {
  if (v.pagamento_valor == null || v.pagamento_valor <= 0) return null;
  const de = formatarMoeda(Number(v.pagamento_valor));
  return v.pagamento_ate && v.pagamento_ate > v.pagamento_valor ? `${de} a ${formatarMoeda(Number(v.pagamento_ate))}` : de;
}

const cabe = (t: string | null | undefined, max: number) => (t && t.length <= max ? t : null);

function semRepetir(lista: (string | null | undefined)[], max: number, quantos: number) {
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
function umDeCada(grupos: (string | null | undefined)[][], max: number, quantos: number) {
  const saida: string[] = [];
  for (const g of grupos) {
    const [t] = semRepetir(g, max, 1).filter((x) => !saida.some((y) => y.toLowerCase() === x.toLowerCase()));
    if (t) saida.push(t);
    if (saida.length === quantos) break;
  }
  return saida;
}

/** A palavra que sozinha diz só o cargo, não a função ("auxiliar" de quê?). */
const SO_O_CARGO =
  /^(auxiliar|assistente|operador|operadora|ajudante|atendente|técnico|técnica|analista|agente|encarregado|encarregada|supervisor|supervisora|gerente|coordenador|coordenadora)$/i;

/**
 * Os nomes da função para as palavras-chave do anúncio: a do título, curta e em minúsculas, e os outros nomes dela
 * (da CBO), até 4.
 */
function basesDaFuncao(titulo: string, sinonimos: string[] = []) {
  const f = funcaoCurta(funcaoDoTitulo(titulo)).toLowerCase();
  return [...new Set([f, ...sinonimos.map((s) => funcaoCurta(s).toLowerCase())])].slice(0, 4);
}

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Mn}/gu, "");

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
  return corte.length >= 3 && corte.length <= 45 ? corte : null;
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
        if (p && !p.split(" ").every((w) => SO_ISSO_NAO.test(semAcento(w)))) frases.add(p);
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
  return p.length >= 3 && p.length <= 80 && p.split(" ").length <= 10 ? p : null;
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
 * convite, sem salário nem regime). `sinonimos`: outros nomes da função (da CBO), para as palavras-chave.
 */
export function textoDoAnuncio(v: VagaDoImpulso, opcoes: { simples?: boolean; sinonimos?: string[] } = {}): TextoDoAnuncio {
  const funcao = funcaoCurta(funcaoDoTitulo(v.titulo));
  const f = funcao.toLowerCase();
  const sal = salarioDaVaga(v);
  const por = v.pagamento_unidade ? POR[v.pagamento_unidade] : null;
  const regime = v.regime && v.regime in REGIMES ? REGIMES[v.regime as Regime] : null;
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
    ? semRepetir([funcao, `Vaga em ${cidade}`, "Vaga de emprego", "Candidatura grátis", "Veja a vaga"], 30, 5)
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
  const minimos = semRepetir([...titulos, "Vaga de emprego", "Candidatura grátis", "Veja a vaga no Publike"], 30, 15);

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
            sal ? `${funcao} em ${bairro}. ${sal}${por ? ` ${por}` : ""}. Veja a vaga e candidate-se.` : null,
            sal ? `${funcao}. ${sal}${por ? ` ${por}` : ""}. Veja a vaga e candidate-se.` : null,
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
          ["Curtiu a vaga e deu match: você conversa direto com quem contrata. É grátis."],
        ],
        90,
        4,
      );

  const bases = basesDaFuncao(v.titulo, opcoes.sinonimos);
  const palavras: string[] = [];
  const vistas = new Set<string>();
  for (const b of bases) {
    for (const p of [
      `vaga ${b}`,
      `vaga de ${b}`,
      `emprego de ${b}`,
      `vaga ${b} ${cidade}`,
      `emprego ${b} ${cidade}`,
      `${b} ${cidade}`,
      `vaga ${b} ${bairro}`,
    ]) {
      const limpa = palavraLimpa(p);
      if (limpa && !vistas.has(limpa)) {
        vistas.add(limpa);
        palavras.push(limpa);
      }
    }
  }

  // as buscas largas de quem procura emprego perto (as que mais trazem gente na campanha geral da Publike: "vagas de
  // emprego em goiânia", "empregos perto de mim"); o anúncio mostra esta vaga, e o lugar da campanha já é o perto dela
  const largas = [
    ...new Set(
      [`vagas de emprego ${cidade}`, `vagas de emprego ${bairro}`, "empregos perto de mim"]
        .map(palavraLimpa)
        .filter((p): p is string => Boolean(p) && !vistas.has(p as string)),
    ),
  ];

  return {
    titulos: minimos.length >= 3 ? minimos : [...minimos, "Vaga de emprego", "Candidatura grátis", "Veja a vaga"].slice(0, 3),
    descricoes: descricoes.length >= 2 ? descricoes : [...descricoes, "Veja a vaga e candidate-se pelo Publike."].slice(0, 2),
    palavras: [...palavras.slice(0, 15 - largas.length), ...largas],
    caminho1: "vagas",
    caminho2: caminho(funcao) || "emprego",
  };
}
