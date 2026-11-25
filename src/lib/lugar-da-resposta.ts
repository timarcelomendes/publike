// O lugar da vaga que a pessoa responde na conversa do WhatsApp, quando a foto do anúncio não dizia (23/11/2026; a foto
// da Hering, com "Operador de caixa" sem lugar e "Vendedor(a) · Passeio das Águas" sem a cidade, ia para o site).
// "Setor Bueno, Goiânia", "Passeio das Águas em Goiânia", "Goiânia - GO", "Centro": a cidade só vale da lista das
// praças (CIDADES); sem ela no texto, a do bairro (quando o bairro é de uma cidade só) ou a que a vaga já tinha.
// `null`: não parece um lugar (uma pergunta, um "ok", um link, uma frase comprida): o atendimento segue normal.
//
// O lugar de fora (25/11/2026; a ANPE respondeu "barueri sp" e depois "SÃO PAULO", que virou a Vila São Paulo, em
// Goiânia): a sigla de outro estado, o nome de outro estado ou de uma cidade de fora (fora-da-regiao.ts) voltam como
// `{ fora }`, e quem respondeu a pergunta da cidade com uma cidade que não é das praças também. "Goiás" ou "GO"
// sozinho: `{ soGoias }` (falta a cidade).

import { BAIRROS } from "./bairros";
import { CIDADES, type Cidade } from "./constantes";
import { nomeDeFora, rotuloDoLugar, siglaDeFora, soGoias } from "./fora-da-regiao";
import { chaveBairro } from "./regioes";

export type LugarRespondido = { bairro: string; cidade: Cidade | null };
/** O lugar é de fora de onde o Publike funciona: o rótulo ("Barueri (SP)", "Minas Gerais"). */
export type LugarDeFora = { fora: string };
/** Só "Goiás" ou "GO": falta a cidade. */
export type SoOEstado = { soGoias: true };
export type RespostaDoLugar = LugarRespondido | LugarDeFora | SoOEstado;
/**
 * O que a pergunta pediu (`perguntaDoLugar`): só a cidade (o bairro já veio), só o bairro (de uma cidade daqui) ou os
 * dois. Na pergunta da cidade, o nome que não é de uma cidade das praças é de fora; na do bairro, o nome sozinho de
 * uma cidade de fora é o bairro daqui ("São Paulo", em Goiânia, é a Vila São Paulo).
 */
export type ContextoDoLugar = "cidade" | "bairro" | "lugar";

export const eDeFora = (r: RespostaDoLugar | null): r is LugarDeFora => Boolean(r && "fora" in r);
export const eSoOEstado = (r: RespostaDoLugar | null): r is SoOEstado => Boolean(r && "soGoias" in r);

const ACENTOS: Record<string, string> = {
  a: "[aáàâã]",
  e: "[eéê]",
  i: "[ií]",
  o: "[oóôõ]",
  u: "[uúü]",
  c: "[cç]",
};

/** O nome da cidade como expressão, aceitando com e sem acento ("goi[aáàâã]n[ií][aáàâã]"). */
function padraoDaCidade(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[aeiouc]/g, (l) => ACENTOS[l])
    .replace(/\s+/g, "\\s+");
}

// as maiores primeiro: "Aparecida de Goiânia" antes de "Goiânia"
const CIDADES_POR_TAMANHO = [...CIDADES].sort((a, b) => b.length - a.length).map((c) => ({ c, p: padraoDaCidade(c) }));
/** Os nomes curtos que todo mundo usa ("Setor Garavelo, Aparecida"): só depois de vírgula, traço ou "em", ou sozinhos. */
const APELIDOS: { c: Cidade; p: string }[] = [
  { c: "Aparecida de Goiânia", p: padraoDaCidade("Aparecida") },
  { c: "Bela Vista de Goiás", p: padraoDaCidade("Bela Vista") },
  // "Petrolina - PE" já saiu antes, pela sigla
  { c: "Petrolina de Goiás", p: padraoDaCidade("Petrolina") },
];
const UF = String.raw`(?:\s*[-/,(]?\s*(?:go|goi[aá]s)\)?)?`;
const SEPARA = String.raw`[\s,;:/–-]`;

/** As palavras do começo de um bairro que, sozinhas, não são o bairro ("Vila Trindade" não é Vila, em Trindade). */
const SO_O_COMECO = /^(vila|setor|st\.?|jardim|jd\.?|residencial|res\.?|parque|pq\.?|conjunto|loteamento|bairro|ch[aá]cara|condom[ií]nio)$/i;
/** O que mostra que é um lugar, mesmo sem a cidade. */
const CARA_DE_LUGAR =
  /^(setor|st\.?|jardim|jd\.?|vila|residencial|res\.?|parque|pq\.?|conjunto|loteamento|bairro|centro|ch[aá]cara|condom[ií]nio|shopping|avenida|av\.?|rua|pra[cç]a|n[uú]cleo|recanto|alto|polo|distrito|regi[aã]o|cidade|mans[oõ]es)\b/i;
/** Palavras que mostram que não é o lugar (uma pergunta sem "?", um pedido, um "não sei"). */
const NAO_E_LUGAR =
  /\b(sim|n[aã]o|ok|okay|beleza|blz|certo|isso|perfeito|show|top|j[oó]ia|t[aá] bom|tudo bem|entendi|aguardo|quanto|como|qual|quando|onde|porque|preciso|quero|posso|pode|tem|sei|obrigad[oa]|valeu|bom dia|boa tarde|boa noite|oi|ol[aá]|vaga|vagas|candidat\w*|publicar|publica|site|link|whatsapp|zap|cnpj|pagar|paga|custa|gr[aá]tis|curr[ií]culo|emprego|sal[aá]rio|hor[aá]rio|depois|amanh[aã]|aguarda|espera)\b/i;

function limparBairro(b: string) {
  return b
    .replace(/^[\s,;:/–.-]+|[\s,;:/–.-]+$/g, "")
    .replace(/^(?:(?:o trabalho|a vaga|a loja|a empresa|o servi[cç]o)\s+)?(?:(?:fica|[eé]|eh|vai ser)\s+)?(?:(?:no|na|nos|nas|em)\s+)/i, "")
    .replace(/^(?:bairro|endere[cç]o|local)\s*[:\-–]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** As cidades das praças que têm um bairro com esse nome. */
function cidadesDoBairro(bairro: string): Cidade[] {
  const chave = chaveBairro(bairro);
  if (!chave) return [];
  return CIDADES.filter((c) => BAIRROS[c]?.some((b) => chaveBairro(b) === chave));
}

export function lugarDaResposta(
  texto: string,
  cidadeDaVaga?: string | null,
  contexto: ContextoDoLugar = "lugar",
): RespostaDoLugar | null {
  const t = texto
    .replace(/\s+/g, " ")
    .trim()
    // o "bom dia" antes do lugar
    .replace(/^(bom dia|boa tarde|boa noite|oi|ol[aá])[\s,!.]*/i, "")
    .replace(/[.!]+$/, "")
    // os apelidos das cidades daqui: "Ap. de Goiânia", "Apda Goiânia", "Gyn"
    .replace(/\bap(?:da|ar)?\.?\s*(?:de\s+)?(goi[aáàâã]n[ií][aáàâã])\b/gi, "Aparecida de $1")
    .replace(/\bgyn\b/gi, "Goiânia")
    .trim();
  // só o estado: "GO" (falta a cidade) ou outro ("SP"), antes do tamanho mínimo
  if (soGoias(t)) return { soGoias: true };
  const sigla = siglaDeFora(t);
  if (sigla) return { fora: sigla };
  if (t.length < 3 || t.length > 90 || t.includes("?")) return null;
  if (/https?:|www\.|@/i.test(t) || /\d{6,}/.test(t.replace(/[\s().-]/g, ""))) return null;
  if (t.startsWith("[")) return null;

  let cidade: Cidade | null = null;
  let resto = t;
  for (const { c, p } of CIDADES_POR_TAMANHO) {
    const noFim = new RegExp(String.raw`^(.*?)(?:^|${SEPARA}+)(?:(?:em|de|na|no)\s+)?${p}${UF}\s*$`, "i").exec(t);
    if (noFim) {
      cidade = c;
      resto = noFim[1];
      break;
    }
    const noComeco = new RegExp(String.raw`^${p}${UF}${SEPARA}+(.+)$`, "i").exec(t);
    if (noComeco) {
      cidade = c;
      resto = noComeco[1];
      break;
    }
  }
  if (!cidade)
    for (const { c, p } of APELIDOS) {
      const noFim = new RegExp(String.raw`^(?:(.*?)(?:\s*[,;/–-]\s*|\s+em\s+))?${p}${UF}\s*$`, "i").exec(t);
      if (noFim) {
        cidade = c;
        resto = noFim[1] ?? "";
        break;
      }
    }
  // "Vila Trindade": o bairro inteiro, sem cidade
  if (cidade && SO_O_COMECO.test(limparBairro(resto))) {
    cidade = null;
    resto = t;
  }
  // sem uma cidade daqui: o nome de outro estado ou de uma cidade de fora ("São Paulo", "Centro, Uberlândia"); na
  // pergunta do bairro, só depois de vírgula ou traço
  if (!cidade) {
    const fora = nomeDeFora(t, { sozinho: contexto !== "bairro" });
    if (fora) return { fora };
  }
  const bairro = limparBairro(resto);
  if (bairro) {
    if (bairro.length > 60 || !/\p{L}{2}/u.test(bairro) || NAO_E_LUGAR.test(bairro)) return null;
    // na pergunta da cidade, o nome que não é de uma cidade das praças (nem um "Setor…", que diz o bairro) é de fora
    if (contexto === "cidade" && !cidade && !CARA_DE_LUGAR.test(bairro)) return { fora: rotuloDoLugar(bairro) };
    // sem a cidade, só vale o que tem cara de lugar: um bairro da lista, um "Setor…", "Shopping…", "Rua…", ou um
    // nome curto (até 6 palavras)
    const daLista = cidadesDoBairro(bairro);
    if (!cidade && !daLista.length && !CARA_DE_LUGAR.test(bairro) && bairro.split(" ").length > 6) return null;
    if (!cidade) {
      if (daLista.length === 1) cidade = daLista[0];
      else {
        const daVaga = CIDADES.find((c) => c === cidadeDaVaga);
        if (daVaga && (!daLista.length || daLista.includes(daVaga))) cidade = daVaga;
      }
    }
  }
  if (!bairro && !cidade) return null;
  return { bairro, cidade };
}
