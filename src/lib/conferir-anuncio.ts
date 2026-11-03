import { CIDADES } from "./constantes";

// O que derruba a confiança na vitrine (claude/plano-home-visitante.md, item 2): título todo em maiúsculas, anúncio
// que fala de outro estado (o estágio em Pernambuco) e título com outra cidade da região (a vaga de Trindade marcada
// em Goiânia). O título gritando é arrumado ao salvar (registroDoAnuncio); o resto vai para Admin › Anúncios ›
// Para conferir, porque a conta pode errar (a "Rua Bahia" de Goiânia não é na Bahia).

/** Siglas que ficam em maiúsculas quando o título é arrumado. */
const SIGLAS = new Set([
  "CLT",
  "PJ",
  "RH",
  "TI",
  "CNH",
  "PCD",
  "MEI",
  "CPF",
  "CNPJ",
  "VT",
  "VA",
  "VR",
  "EAD",
  "SUS",
  "GO",
  "DF",
  "CEP",
  "II",
  "III",
  "IV",
  "VI",
  "VII",
  "SAC",
  "ADM",
  "AUX",
  "EPI",
  "NR",
  "NR10",
  "NR35",
  "UTI",
  "ONG",
  "BRF",
]);

const letras = (t: string) => t.replace(/[^\p{L}]/gu, "");

/** O título está gritando: com 6 letras ou mais, 70% ou mais em maiúsculas. */
export function tituloGritando(titulo: string) {
  const l = letras(titulo);
  if (l.length < 6) return false;
  const maiusculas = l.replace(/[^\p{Lu}]/gu, "").length;
  return maiusculas / l.length >= 0.7;
}

/**
 * O título gritando em letra normal: só a primeira letra em maiúscula, as siglas conhecidas como são e as
 * cidades da região com o nome certo ("ESTÁGIO EM TRINDADE - CLT" → "Estágio em Trindade - CLT"). O que não
 * grita fica como está.
 */
export function tituloLegivel(titulo: string) {
  if (!tituloGritando(titulo)) return titulo;
  let saida = titulo
    .toLocaleLowerCase("pt-BR")
    .replace(/[\p{L}\p{N}]+/gu, (palavra) => (SIGLAS.has(palavra.toUpperCase()) ? palavra.toUpperCase() : palavra));
  for (const cidade of CIDADES) {
    const achar = new RegExp(`(?<![\\p{L}])${cidade.toLocaleLowerCase("pt-BR")}(?![\\p{L}])`, "gu");
    saida = saida.replace(achar, cidade);
  }
  return saida.replace(/\p{L}/u, (l) => l.toLocaleUpperCase("pt-BR"));
}

const ESTADOS = [
  "Acre",
  "Alagoas",
  "Amapá",
  "Amazonas",
  "Bahia",
  "Ceará",
  "Distrito Federal",
  "Brasília",
  "Espírito Santo",
  "Maranhão",
  "Mato Grosso",
  "Minas Gerais",
  "Pará",
  "Paraíba",
  "Paraná",
  "Pernambuco",
  "Piauí",
  "Rio de Janeiro",
  "Rio Grande do Norte",
  "Rio Grande do Sul",
  "Rondônia",
  "Roraima",
  "Santa Catarina",
  "São Paulo",
  "Sergipe",
  "Tocantins",
];
const LOGRADOURO =
  "(?:rua|r\\.|av\\.?|avenida|alameda|al\\.|praça|pça\\.?|setor|vila|jardim|residencial|bairro|travessa|quadra)\\s+(?:d[aeo]s?\\s+)?";
const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

/** Os outros estados que o texto cita ("Pernambuco", "- SP", "(MG)"). "Pará" só com acento (não pega o "para"). */
export function outrosEstados(texto: string) {
  const achados = new Set<string>();
  for (const e of ESTADOS) {
    const sensivel = e === "Pará";
    // nome de rua, avenida ou bairro de Goiânia ("Rua Bahia", "Av. São Paulo") não conta
    const re = new RegExp(`(?<!${LOGRADOURO})(?<![\\p{L}])${e}(?![\\p{L}])`, sensivel ? "u" : "iu");
    if (re.test(texto)) achados.add(e);
  }
  for (const m of texto.matchAll(new RegExp(`(?:[-–/(,]\\s*)(${UFS})(?![\\p{L}])`, "gu"))) achados.add(m[1]);
  return [...achados];
}

/** As cidades da região que o título cita e não são a do anúncio ("Oficial de cozinha (Trindade…)" em Goiânia). */
export function outrasCidadesNoTitulo(titulo: string, cidade: string) {
  const t = titulo.toLocaleLowerCase("pt-BR");
  return CIDADES.filter((c) => {
    if (c === cidade || cidade.includes(c)) return false;
    return new RegExp(`(?<![\\p{L}])${c.toLocaleLowerCase("pt-BR")}(?![\\p{L}])`, "u").test(t);
  });
}

export type MotivoConferir = { tipo: "gritando" | "estado" | "cidade" | "recado"; texto: string };

/** A descrição começa como recado de quem recruta ("Meu nome é Thais e faço parte…"), e não pela vaga. */
export function descricaoDeRecado(descricao: string | null) {
  return /^\s*(?:ol[áa][,!.\s]+|oi[,!.\s]+|bom dia[,!.\s]+|boa tarde[,!.\s]+)?(?:meu nome [ée]|me chamo|eu sou (?:a|o) |sou (?:a|o) [\p{Lu}][\p{L}]+ e )/iu.test(
    descricao ?? "",
  );
}

/** Por que o anúncio precisa de um olhar (vazio: está bom). */
export function motivosParaConferir(a: { titulo: string; descricao: string | null; cidade: string }): MotivoConferir[] {
  const motivos: MotivoConferir[] = [];
  if (tituloGritando(a.titulo)) motivos.push({ tipo: "gritando", texto: "Título todo em maiúsculas" });
  const estados = outrosEstados(`${a.titulo} ${a.descricao ?? ""}`);
  if (estados.length) motivos.push({ tipo: "estado", texto: `Fala de outro estado: ${estados.join(", ")}` });
  if (descricaoDeRecado(a.descricao))
    motivos.push({ tipo: "recado", texto: "A descrição começa como recado (“Meu nome é…”), e não pela vaga" });
  const cidades = outrasCidadesNoTitulo(a.titulo, a.cidade);
  if (cidades.length)
    motivos.push({ tipo: "cidade", texto: `O título fala de ${cidades.join(", ")}, e a vaga está em ${a.cidade}` });
  return motivos;
}
