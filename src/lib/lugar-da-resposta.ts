// O lugar da vaga que a pessoa responde na conversa do WhatsApp, quando a foto do anúncio não dizia (23/11/2026; a foto
// da Hering, com "Operador de caixa" sem lugar e "Vendedor(a) · Passeio das Águas" sem a cidade, ia para o site).
// "Setor Bueno, Goiânia", "Passeio das Águas em Goiânia", "Goiânia - GO", "Centro": a cidade só vale da lista das
// praças (CIDADES); sem ela no texto, a do bairro (quando o bairro é de uma cidade só) ou a que a vaga já tinha.
// `null`: não parece um lugar (uma pergunta, um "ok", um link, uma frase comprida): o atendimento segue normal.

import { BAIRROS } from "./bairros";
import { CIDADES, type Cidade } from "./constantes";
import { chaveBairro } from "./regioes";

export type LugarRespondido = { bairro: string; cidade: Cidade | null };

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
];
const UF = String.raw`(?:\s*[-/,]?\s*(?:go|goi[aá]s))?`;
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

export function lugarDaResposta(texto: string, cidadeDaVaga?: string | null): LugarRespondido | null {
  const t = texto
    .replace(/\s+/g, " ")
    .trim()
    // o "bom dia" antes do lugar
    .replace(/^(bom dia|boa tarde|boa noite|oi|ol[aá])[\s,!.]*/i, "")
    .replace(/[.!]+$/, "")
    .trim();
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
  const bairro = limparBairro(resto);
  if (bairro) {
    if (bairro.length > 60 || !/\p{L}{2}/u.test(bairro) || NAO_E_LUGAR.test(bairro)) return null;
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
