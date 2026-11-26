// A leitura das vagas (19/11/2026; src/lib/ia/ler-vagas.ts lê com a IA): o que vale no navegador e no servidor. O lugar
// da vaga na lista de bairros, o título sem caixa alta, o "parece vaga" do texto do WhatsApp, e o resumo e o que falta
// para a mensagem do WhatsApp.

import { BAIRROS } from "./bairros";
import { CIDADES, nomeEscolaridade, nomeExperiencia, nomeJornada, nomeModelo, REGIMES, type Cidade } from "./constantes";
import type { RascunhoConvite } from "./convites";
import { formatarValor } from "./formato";
import { nomeDeFora, siglaDeFora } from "./fora-da-regiao";
import { eDeFora, lugarDaResposta } from "./lugar-da-resposta";
import { cidadeDoPublike } from "./pracas";
import { temContato, temContatoNoTexto } from "./validacao";
import { textoDoHorario } from "./vaga-extra";

/** O que a leitura achou: vaga, serviço oferecido, currículo, golpe ou outra coisa. */
export const TIPOS_DA_LEITURA = ["vaga", "servico", "curriculo", "golpe", "outro"] as const;
export type TipoDaLeitura = (typeof TIPOS_DA_LEITURA)[number];

export type EmpresaLida = {
  nome: string;
  tipo: "empresa" | "agencia" | "prestador";
  /** com DDD, só os números ("62999990000") */
  whatsapp: string[];
  telefones: string[];
  email: string;
};

export type LeituraDeVagas = {
  tipo: TipoDaLeitura;
  /** por que não é vaga, em poucas palavras */
  motivo: string;
  empresa: EmpresaLida;
  vagas: RascunhoConvite[];
  /** o texto que a IA conseguiu ler (para conferir) */
  textoLido: string;
  /** o que ficou de fora (pedido que exclui pessoas, contato tirado do texto) */
  alertas: string[];
};

// --- O lugar -----------------------------------------------------------------------------------------------------

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** As abreviações dos bairros de Goiânia e região ("St. Bueno", "Jd. América", "Res. Eldorado"). */
const ABREVIACOES: [RegExp, string][] = [
  [/^(st|set|sto)\.?\s+/i, "Setor "],
  [/^(jd|jdm|jard)\.?\s+/i, "Jardim "],
  [/^(res|resid)\.?\s+/i, "Residencial "],
  [/^(pq|prq)\.?\s+/i, "Parque "],
  [/^(vl)\.?\s+/i, "Vila "],
  [/^(cj|conj)\.?\s+/i, "Conjunto "],
  [/^(lot)\.?\s+/i, "Loteamento "],
  [/^(cd|cid)\.?\s+/i, "Cidade "],
  [/^(cond)\.?\s+/i, "Condomínio "],
];

const expandir = (bairro: string) => ABREVIACOES.reduce((b, [re, por]) => b.replace(re, por), bairro.trim());

let indice: Map<string, { cidade: Cidade; bairro: string }[]> | null = null;
function indiceDosBairros() {
  if (indice) return indice;
  indice = new Map();
  for (const cidade of CIDADES) {
    for (const bairro of BAIRROS[cidade] ?? []) {
      const k = semAcento(bairro);
      const lista = indice.get(k) ?? [];
      lista.push({ cidade, bairro });
      indice.set(k, lista);
    }
  }
  return indice;
}

/** "Goiânia - GO", "Goiania/GO", "GOIÂNIA" → "Goiânia" (só as cidades onde o Publike funciona). */
export function cidadeLida(cidade: string | null | undefined): Cidade | null {
  const limpa = (cidade ?? "").replace(/\s*[-/,]\s*(go|goi[aá]s)\b.*$/i, "").trim();
  return limpa ? cidadeDoPublike(limpa) : null;
}

/**
 * O lugar como está na lista do Publike: o bairro com o nome da lista ("st bueno" → "Setor Bueno") e, quando o
 * anúncio só diz o bairro, a cidade dele (Goiânia primeiro, se o nome existe em mais de uma). O bairro que não está na
 * lista fica como veio, sem abreviação.
 */
export function lugarDaVaga(
  cidade: string | null | undefined,
  bairro: string | null | undefined,
  /** a vaga remota não tem lugar de fora: a cidade fica para a pessoa dizer */
  modelo?: string | null,
): { cidade: string; bairro: string; fora?: string } {
  const lida = (cidade ?? "")
    .replace(/\s+/g, " ")
    .trim()
    // "Goiânia e região", "Grande Goiânia", "Região Metropolitana de Goiânia"
    .replace(/^(?:regi[aã]o\s+metropolitana\s+de|grande)\s+/i, "")
    .replace(/\s+e\s+regi[aã]o$/i, "");
  let c = cidadeLida(lida);
  const b = (bairro ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const bairroLimpo = !b || temContato(b) ? "" : expandir(b);
  // o lugar de fora (25/11/2026; a vaga de Barueri, SP, que saiu como Goiânia): a cidade lida que não é das praças
  // ("Barueri - SP", "São Paulo", "Itapevi") ou a sigla de outro estado no bairro ("Alphaville, Barueri - SP") vêm em
  // `fora`, sem a cidade daqui; os apelidos daqui ("Aparecida", "Goiânia (GO)") ficam com a cidade
  if (modelo !== "remoto") {
    if (!c && lida) {
      const r = lugarDaResposta(lida, null, "cidade");
      if (eDeFora(r)) return { cidade: "", bairro: bairroLimpo, fora: r.fora };
      if (r && "cidade" in r && r.cidade && !r.bairro) c = r.cidade;
    }
    const noBairro = !c && b ? (siglaDeFora(b) ?? nomeDeFora(b, { sozinho: false })) : null;
    if (noBairro) return { cidade: "", bairro: bairroLimpo, fora: noBairro };
  }
  if (!b || temContato(b)) return { cidade: c ?? "", bairro: "" };
  const longo = expandir(b);
  const achados = indiceDosBairros().get(semAcento(longo)) ?? indiceDosBairros().get(semAcento(b)) ?? [];
  const daCidade = c ? achados.find((a) => a.cidade === c) : null;
  if (daCidade) return { cidade: c!, bairro: daCidade.bairro };
  if (c) return { cidade: c, bairro: longo };
  const escolhido = achados.find((a) => a.cidade === "Goiânia") ?? achados[0];
  return escolhido ? { cidade: escolhido.cidade, bairro: escolhido.bairro } : { cidade: "", bairro: longo };
}

// --- O texto -----------------------------------------------------------------------------------------------------

/** As palavras que ficam minúsculas no meio do título. */
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o", "na", "no", "ou"]);
/** As siglas que ficam como são. */
const SIGLAS = new Set(["rh", "ti", "pcd", "cnh", "clt", "pj", "mei", "sac", "ux", "ui", "cd", "dp"]);

/**
 * O título como cargo: sem ponto no fim e sem caixa alta ("ATENDENTE DE LOJA." → "Atendente de loja"); as siglas
 * ficam ("Analista de RH"). O título que já vem com maiúsculas e minúsculas fica como está.
 */
export function tituloLimpo(titulo: string) {
  const t = titulo
    .replace(/\s+/g, " ")
    .replace(/[.;:!]+$/, "")
    .replace(/^[-–•*\s]+/, "")
    .trim()
    .slice(0, 90);
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letras || letras !== letras.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => {
      if (SIGLAS.has(p.replace(/[^a-z]/g, ""))) return p.toUpperCase();
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p;
    })
    .join(" ");
}

/** A descrição sem as linhas com telefone, e-mail, link ou @ (a IA deveria ter tirado; aqui é a garantia). */
export function semContatoNaDescricao(descricao: string) {
  const linhas = descricao.replace(/\r/g, "").split("\n");
  const limpas = linhas.filter((l) => !temContatoNoTexto(l));
  return {
    texto: limpas
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    tirou: limpas.length < linhas.length,
  };
}

/** O telefone com DDD, só os números ("(62) 9 9999-0000" → "62999990000"); sem DDD, o 62. */
export function telefoneLido(t: string) {
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 11) d = d.slice(1);
  if (d.length === 8 || d.length === 9) d = `62${d}`;
  return /^[1-9][0-9][0-9]{8,9}$/.test(d) ? d : null;
}

// --- "Parece vaga" (o texto que chega no WhatsApp) -----------------------------------------------------------------

const PISTAS_DE_VAGA =
  /\b(vagas?|contrata(?:mos|-se|ndo)?|precisa-se|precisamos|oportunidade|sal[aá]rio|r\$ ?\d|requisitos?|benef[ií]cios?|hor[aá]rio|escala|clt|carteira assinada|experi[eê]ncia|vale[- ]transporte|vale[- ]refei[cç][aã]o|cargo|fun[cç][aã]o|interessad[oa]s|di[aá]ria|carga hor[aá]ria|segunda a sexta|seg a sex)\b/gi;
/** Quem procura trabalho escreve na primeira pessoa: "procuro vaga", "tenho experiência", "sou cozinheira". */
const QUEM_PROCURA =
  /\b(procuro|estou procurando|to procurando|busco|preciso de (um )?(emprego|trabalho|servi[cç]o)|quero (uma )?(vaga|trabalhar)|tem vagas?|t[eê]m vagas?|tenho experi[eê]ncia|sou (um |uma )?[a-zçãéêó]+ ?(e )?procuro|meu curr[ií]culo|estou desempregad|me candidatar|como (eu )?(me )?candidat)/i;

/**
 * O texto parece o anúncio de uma vaga (e não uma pergunta de quem procura trabalho)? Para o WhatsApp ler a vaga só
 * quando faz sentido: pelo menos duas pistas, ou uma num texto longo.
 */
export function pareceVaga(texto: string) {
  const t = texto.trim();
  if (t.length < 40 || QUEM_PROCURA.test(t)) return false;
  const pistas = new Set((t.match(PISTAS_DE_VAGA) ?? []).map((x) => semAcento(x)));
  return pistas.size >= 2 || (t.length >= 160 && pistas.size >= 1);
}

// --- O resumo para o WhatsApp ------------------------------------------------------------------------------------

/** "a, b e c" */
export const juntarComE = (l: string[]) => (l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} e ${l.at(-1)}`);

/** "R$ 1.800 por mês" (com a faixa e os ganhos a mais), ou null sem valor. */
export function valorDaVagaLida(v: RascunhoConvite) {
  if (v.salario == null) return null;
  return formatarValor(v.salario, v.unidade || "mes", null, false, { ate: v.salario_ate, ganhos: v.ganhos_extras ?? [] });
}

/**
 * O resumo da vaga lida, em linhas curtas, para a mensagem do WhatsApp: o cargo e quantas vagas, o salário com o
 * jeito de contratar, o horário, o lugar, os benefícios e o que a vaga pede.
 */
export function resumoDaVaga(v: RascunhoConvite) {
  const linhas = [`*${v.titulo}*${v.quantidade > 1 ? ` · ${v.quantidade} vagas` : ""}`];
  const valor = valorDaVagaLida(v);
  const regime = v.regime ? (REGIMES[v.regime as keyof typeof REGIMES]?.selo ?? null) : null;
  if (valor || regime) linhas.push(`Salário: ${[valor ?? "a combinar", regime].filter(Boolean).join(" · ")}`);
  const horario = v.horario_detalhe ? textoDoHorario(v.horario_detalhe) : null;
  const jornada = nomeJornada(v.jornada);
  if (horario || jornada) linhas.push(`Horário: ${horario || jornada}`);
  const lugar = [v.bairro, v.cidade].filter(Boolean).join(", ");
  const modelo = v.modelo && v.modelo !== "presencial" ? nomeModelo(v.modelo) : null;
  if (lugar || modelo) linhas.push(`Local: ${[lugar, modelo].filter(Boolean).join(" · ")}`);
  const beneficios = [
    ...v.beneficios.map((b) => BENEFICIO_CURTO[b] ?? b),
    // "Bônus por meta" vira "bônus por meta"; a sigla fica ("PLR")
    ...(v.beneficios_extras ?? []).map((b) => (/^\p{Lu}\p{Ll}/u.test(b) ? b[0].toLowerCase() + b.slice(1) : b)),
  ];
  if (beneficios.length)
    linhas.push(
      `Benefícios: ${
        beneficios.length > 6 ? `${beneficios.slice(0, 6).join(", ")} e mais ${beneficios.length - 6}` : juntarComE(beneficios)
      }`,
    );
  const experiencia = v.experiencia && v.experiencia !== "sem" ? nomeExperiencia(v.experiencia) : null;
  const pede = [
    nomeEscolaridade(v.escolaridade_minima),
    experiencia ? `experiência de ${experiencia.replace(/^Pelo menos /, "").replace(/ ou mais$/, "+")}` : null,
    v.cnh ? `CNH ${v.cnh}` : null,
  ].filter(Boolean) as string[];
  if (pede.length) linhas.push(`Pede: ${pede.join(" · ")}`);
  if (v.experiencia === "sem") linhas.push("Aceita sem experiência");
  if (v.comeca_ja) linhas.push("Começa já");
  return linhas.join("\n");
}

/**
 * O resumo numa linha só, para a variável de um modelo da Meta (sem quebra de linha, sem negrito; até 300 letras):
 * "Atendente · Salário: R$ 1.800 por mês · CLT · Local: Setor Bueno, Goiânia".
 */
export function resumoNumaLinha(v: RascunhoConvite) {
  const linha = resumoDaVaga(v)
    .split("\n")
    .map((l) => l.replace(/\*/g, "").trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ");
  return linha.length > 300 ? `${linha.slice(0, 297).trimEnd()}…` : linha;
}

const BENEFICIO_CURTO: Record<string, string> = {
  vale_transporte: "vale-transporte",
  vale_refeicao: "vale-refeição",
  vale_alimentacao: "vale-alimentação",
  refeicao_no_local: "refeição no local",
  plano_saude: "plano de saúde",
  plano_odontologico: "plano odontológico",
  cesta_basica: "cesta básica",
  seguro_vida: "seguro de vida",
  ajuda_combustivel: "ajuda de combustível",
  auxilio_creche: "auxílio-creche",
  gympass: "academia",
  day_off: "folga no aniversário",
};

/** O que faltou no anúncio e a pessoa completa ao conferir ("o salário e o bairro"). */
export function faltaNaVaga(v: RascunhoConvite) {
  const falta: string[] = [];
  if (v.salario == null) falta.push("o salário");
  if (!v.bairro) falta.push(v.cidade ? "o bairro" : "o bairro e a cidade");
  if (!v.horario_detalhe && !v.jornada) falta.push("o horário");
  return falta;
}

/** A linha de cada vaga na lista do lote ("1. *Atendente* · R$ 1.800 por mês · Setor Bueno"). */
export function linhaDaVaga(v: RascunhoConvite, i: number) {
  const valor = valorDaVagaLida(v);
  return `${i + 1}. *${v.titulo}*${v.quantidade > 1 ? ` (${v.quantidade})` : ""}${valor ? ` · ${valor}` : ""}${
    v.bairro ? ` · ${v.bairro}` : ""
  }`;
}

/** Por que a imagem não virou vaga, para quem publica. */
export function erroDaLeitura(tipo: string, motivo: string, onde: "imagem" | "texto" = "imagem") {
  if (tipo === "servico") return "Isso parece o anúncio de um serviço. Para oferecer serviço, use “Meus serviços” no painel.";
  if (tipo === "curriculo") return "Isso parece um currículo. Para cadastrar o seu, use “Meu currículo” no menu.";
  if (tipo === "golpe")
    return "Esse anúncio pede pagamento para começar ou tem sinais de golpe, e o Publike não publica. Se a vaga é de verdade, escreva o cargo, o salário, o horário e o local.";
  return `Não parece o anúncio de uma vaga${motivo ? ` (${motivo})` : ""}. ${onde === "imagem" ? "Tente outra imagem." : "Cole o texto da vaga: o cargo, o salário, o horário e o local."}`;
}
