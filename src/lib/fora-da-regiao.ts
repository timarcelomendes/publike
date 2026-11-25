// O lugar de fora de onde o Publike funciona (25/11/2026; a ANPE mandou pelo WhatsApp uma vaga de Barueri, SP:
// "barueri sp" virou o bairro e o "SÃO PAULO" da resposta seguinte virou a Vila São Paulo, em Goiânia, e a vaga saiu
// como "barueri sp, Goiânia"). O que mostra que o lugar é de outro estado ou de uma cidade que o Publike não atende:
//   * a sigla de outro estado no fim ("Barueri - SP", "barueri sp", "Recife/PE"; GO não);
//   * o nome de outro estado ("Minas Gerais", "estado de São Paulo");
//   * o nome de uma cidade grande de fora: as capitais, as maiores do país, as do Entorno do DF e as de Goiás fora das
//     praças. Sozinho, o nome só vale quando não é também um bairro daqui que a gente chama pelo nome ("Campinas" é o
//     Setor Campinas; "São Paulo" e "Belo Horizonte" ficam como as cidades: o bairro daqui vem com "Vila" e "Setor").
// Quem usa: a resposta do lugar na conversa (lugar-da-resposta.ts), a leitura da vaga (leitura-de-vagas.ts) e o
// "Sim, publicar" (que nunca publica uma vaga de fora).

import type { RascunhoConvite } from "./convites";
import { cidadeDoPublike, ONDE_FUNCIONA } from "./pracas";

/** Os outros estados, pela sigla (Goiás fica de fora). */
export const OUTROS_ESTADOS: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** As siglas que, no fim do lugar, são sempre o estado ("barueri sp"), em minúscula e sem traço. */
const SIGLAS_FORTES = new Set(["sp", "rj", "mg", "df", "pr", "sc", "rs", "ba", "mt", "ms", "pb", "rn", "rr", "pi", "ce", "ac", "ro"]);
/**
 * As que também são palavras ("se", "to", "pa"…): só em maiúscula ou depois de "-", "/", "," ou "(" ("Recife - PE").
 * AP fica de fora: "Ap." é Aparecida de Goiânia.
 */
const SIGLAS_FRACAS = new Set(["pe", "es", "ma", "al", "am", "se", "to", "pa"]);

/**
 * As cidades de fora, com o estado. As marcadas com `true` também são o nome de um bairro daqui e, sozinhas, ficam
 * como o bairro (só valem depois de vírgula ou traço: "Centro, Campinas").
 */
const CIDADES_DE_FORA: [string, string, boolean?][] = [
  // as capitais
  ["Rio Branco", "AC"],
  ["Maceió", "AL"],
  ["Macapá", "AP"],
  ["Manaus", "AM"],
  ["Salvador", "BA"],
  ["Fortaleza", "CE"],
  ["Brasília", "DF"],
  ["Vitória", "ES"],
  ["São Luís", "MA"],
  ["Cuiabá", "MT"],
  ["Campo Grande", "MS"],
  ["Belo Horizonte", "MG"],
  ["Belém", "PA"],
  ["João Pessoa", "PB"],
  ["Curitiba", "PR"],
  ["Recife", "PE"],
  ["Teresina", "PI"],
  ["Rio de Janeiro", "RJ"],
  ["Natal", "RN"],
  ["Porto Alegre", "RS"],
  ["Porto Velho", "RO"],
  ["Boa Vista", "RR", true],
  ["Florianópolis", "SC"],
  ["São Paulo", "SP"],
  ["Aracaju", "SE"],
  ["Palmas", "TO"],
  // as maiores do país
  ["Guarulhos", "SP"],
  ["Campinas", "SP", true],
  ["São Gonçalo", "RJ"],
  ["Duque de Caxias", "RJ"],
  ["Nova Iguaçu", "RJ"],
  ["São Bernardo do Campo", "SP"],
  ["Santo André", "SP", true],
  ["Osasco", "SP"],
  ["Ribeirão Preto", "SP"],
  ["Uberlândia", "MG"],
  ["Contagem", "MG"],
  ["Sorocaba", "SP"],
  ["Joinville", "SC"],
  ["Feira de Santana", "BA"],
  ["Londrina", "PR"],
  ["Juiz de Fora", "MG"],
  ["Niterói", "RJ"],
  ["São José dos Campos", "SP"],
  ["Vila Velha", "ES"],
  ["Caxias do Sul", "RS"],
  ["Mauá", "SP", true],
  ["Carapicuíba", "SP"],
  ["Betim", "MG"],
  ["Maringá", "PR"],
  ["Mogi das Cruzes", "SP"],
  ["Diadema", "SP"],
  ["Campina Grande", "PB"],
  ["Montes Claros", "MG", true],
  ["Piracicaba", "SP"],
  ["Olinda", "PE", true],
  ["Cariacica", "ES"],
  ["Bauru", "SP"],
  ["Canoas", "RS"],
  ["Caucaia", "CE"],
  ["Ponta Grossa", "PR"],
  ["Franca", "SP"],
  ["Blumenau", "SC"],
  ["Uberaba", "MG"],
  ["Cascavel", "PR"],
  ["Guarujá", "SP"],
  ["Praia Grande", "SP"],
  ["Taubaté", "SP"],
  ["Limeira", "SP"],
  ["Santarém", "PA"],
  ["Camaçari", "BA"],
  ["Suzano", "SP"],
  ["Governador Valadares", "MG"],
  ["Taboão da Serra", "SP"],
  ["Várzea Grande", "MT"],
  ["Santos", "SP"],
  ["Barueri", "SP"],
  ["Jundiaí", "SP", true],
  ["Sete Lagoas", "MG"],
  ["Divinópolis", "MG"],
  ["Ipatinga", "MG"],
  ["Imperatriz", "MA"],
  ["Dourados", "MS"],
  ["Rondonópolis", "MT"],
  ["Sinop", "MT"],
  ["Araguaína", "TO"],
  ["Gurupi", "TO"],
  ["Marabá", "PA", true],
  ["Parauapebas", "PA"],
  ["Barreiras", "BA"],
  ["Luís Eduardo Magalhães", "BA"],
  ["Patos de Minas", "MG"],
  ["Paracatu", "MG"],
  ["Unaí", "MG"],
  ["Juazeiro do Norte", "CE"],
  ["Mossoró", "RN"],
  ["Caruaru", "PE"],
  ["Arapiraca", "AL"],
  ["Chapecó", "SC"],
  ["Itajaí", "SC"],
  ["Balneário Camboriú", "SC"],
  ["Foz do Iguaçu", "PR"],
  ["Pelotas", "RS"],
  ["Santa Maria", "RS", true],
  ["Cotia", "SP"],
  ["Indaiatuba", "SP"],
  ["São Carlos", "SP", true],
  ["Araraquara", "SP"],
  ["São José do Rio Preto", "SP"],
  ["Presidente Prudente", "SP"],
  ["Marília", "SP", true],
  ["Americana", "SP"],
  ["Hortolândia", "SP"],
  ["Sumaré", "SP"],
  ["Alphaville", "SP", true],
  // o DF e o Entorno
  ["Taguatinga", "DF"],
  ["Ceilândia", "DF"],
  ["Samambaia", "DF", true],
  ["Gama", "DF"],
  ["Sobradinho", "DF"],
  ["Águas Claras", "DF", true],
  ["Recanto das Emas", "DF", true],
  ["Riacho Fundo", "DF"],
  ["Vicente Pires", "DF"],
  ["Guará", "DF"],
  ["Planaltina", "DF"],
  ["Brazlândia", "DF"],
  ["Paranoá", "DF"],
  ["Núcleo Bandeirante", "DF"],
  ["Asa Sul", "DF"],
  ["Asa Norte", "DF"],
  ["Lago Sul", "DF"],
  ["Lago Norte", "DF"],
  ["Valparaíso de Goiás", "GO"],
  ["Valparaíso", "GO"],
  ["Luziânia", "GO"],
  ["Águas Lindas de Goiás", "GO"],
  ["Águas Lindas", "GO"],
  ["Novo Gama", "GO"],
  ["Cidade Ocidental", "GO"],
  ["Formosa", "GO"],
  ["Santo Antônio do Descoberto", "GO"],
  ["Cristalina", "GO"],
  ["Planaltina de Goiás", "GO"],
  ["Padre Bernardo", "GO"],
  ["Alexânia", "GO"],
  // Goiás, fora das praças
  ["Rio Verde", "GO"],
  ["Jataí", "GO"],
  ["Catalão", "GO"],
  ["Itumbiara", "GO"],
  ["Caldas Novas", "GO"],
  ["Mineiros", "GO"],
  ["Quirinópolis", "GO"],
  ["Morrinhos", "GO"],
  ["Pires do Rio", "GO"],
  ["Goianésia", "GO"],
  ["Uruaçu", "GO"],
  ["Porangatu", "GO"],
  ["Niquelândia", "GO"],
  ["Ceres", "GO"],
  ["Rialma", "GO"],
  ["Rubiataba", "GO"],
  ["Itapaci", "GO"],
  ["Iporá", "GO"],
  ["Itaberaí", "GO"],
  ["Jaraguá", "GO", true],
  ["Pirenópolis", "GO"],
  ["Silvânia", "GO"],
  ["Piracanjuba", "GO"],
  ["Itapuranga", "GO"],
  ["Palmeiras de Goiás", "GO"],
  ["São Luís de Montes Belos", "GO"],
  ["Posse", "GO"],
  ["Campos Belos", "GO"],
  ["Minaçu", "GO"],
  ["Goiatuba", "GO"],
  ["Ipameri", "GO"],
  ["Orizona", "GO"],
  ["Vianópolis", "GO"],
  ["Leopoldo de Bulhões", "GO"],
  ["Corumbá de Goiás", "GO"],
  ["Cocalzinho de Goiás", "GO"],
  ["Itauçu", "GO"],
  ["Anicuns", "GO", true],
  ["Firminópolis", "GO"],
  ["Acreúna", "GO"],
  ["Santa Helena de Goiás", "GO"],
  ["Edéia", "GO"],
  ["Indiara", "GO"],
  ["Jandaia", "GO"],
  ["Cezarina", "GO"],
  ["Varjão", "GO"],
  ["Itaguari", "GO"],
  ["Taquaral de Goiás", "GO"],
  ["Itaguaru", "GO"],
  ["Avelinópolis", "GO"],
  ["Nazário", "GO"],
  ["Turvânia", "GO"],
  ["Paraúna", "GO"],
  ["Bom Jesus de Goiás", "GO"],
  ["Goiás Velho", "GO"],
  ["Cidade de Goiás", "GO"],
];

/** Sem acento, minúsculo, só letras e números ("São  Paulo!" → "sao paulo"). */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type DeFora = { nome: string; uf: string; tambemBairro: boolean; estado: boolean };
const POR_NOME = new Map<string, DeFora>([
  ...Object.entries(OUTROS_ESTADOS).map(([uf, nome]) => [chave(nome), { nome, uf, tambemBairro: false, estado: true }] as const),
  ...CIDADES_DE_FORA.map(
    ([nome, uf, tambemBairro]) => [chave(nome), { nome, uf, tambemBairro: Boolean(tambemBairro), estado: false }] as const,
  ),
]);
// "São Paulo" e "Rio de Janeiro" são o estado e a cidade: fica a cidade (o rótulo "São Paulo (SP)")
POR_NOME.set("sao paulo", { nome: "São Paulo", uf: "SP", tambemBairro: false, estado: false });
POR_NOME.set("rio de janeiro", { nome: "Rio de Janeiro", uf: "RJ", tambemBairro: false, estado: false });

/** As palavras que ficam minúsculas no meio do nome ("Barueri" e "Taboão da Serra"). */
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** O nome como a pessoa escreveu, com maiúscula no começo de cada palavra ("SÃO PAULO" → "São Paulo"). */
export function nomeDoLugar(texto: string) {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
    // depois de vírgula, barra, parêntese ou traço, maiúscula também ("alphaville,barueri" → "Alphaville,Barueri")
    .replace(/([,/(-]\s*)(\p{Ll})/gu, (_, antes: string, l: string) => antes + l.toUpperCase());
}

/** "Barueri (SP)", "Rio Verde (GO)"; o estado sozinho, só o nome ("Minas Gerais"). */
const rotulo = (d: Pick<DeFora, "nome" | "uf" | "estado">) => (d.estado || !d.nome ? d.nome || OUTROS_ESTADOS[d.uf] : `${d.nome} (${d.uf})`);

/** O rótulo do lugar que a pessoa escreveu: com o estado, quando é uma cidade conhecida ("campinas" → "Campinas (SP)"). */
export function rotuloDoLugar(texto: string) {
  const conhecida = POR_NOME.get(chave(texto));
  return conhecida ? rotulo(conhecida) : nomeDoLugar(texto);
}

/** O "Brasil" e a pontuação do fim ("Barueri - SP, Brasil." → "Barueri - SP"). */
function semFim(texto: string) {
  return texto
    .replace(/\s+/g, " ")
    .replace(/[\s,.;!-]*\bbrasil\b[\s.!]*$/i, "")
    .replace(/[.!;\s]+$/, "")
    .replace(/\bS\.\s?([A-Z])\.?$/, "S$1")
    .trim();
}

/**
 * A sigla de outro estado no fim ("barueri sp", "Recife - PE", "Uberlândia/MG", "SP"): o rótulo do lugar
 * ("Barueri (SP)", "São Paulo"). `null`: sem sigla de fora (GO, nenhuma, ou uma palavra como "se" ou "ap").
 */
export function siglaDeFora(texto: string): string | null {
  const t = semFim(texto);
  const m = /^(.*?)(\s*[-–/,(]\s*|\s+|^)([A-Za-z]{2})\.?\)?$/.exec(t);
  if (!m) return null;
  const [, antes, separador, sigla] = m;
  const s = sigla.toLowerCase();
  const pontuado = /[-–/,(]/.test(separador) || !antes.trim();
  const maiuscula = sigla === sigla.toUpperCase();
  if (!(SIGLAS_FORTES.has(s) || (SIGLAS_FRACAS.has(s) && (pontuado || maiuscula)))) return null;
  // "Belo Horizonte, MG" e "MG": o nome do lugar e a sigla
  const nome = antes.replace(/[\s,;:/–-]+$/, "").trim();
  const uf = s.toUpperCase();
  if (!nome) return OUTROS_ESTADOS[uf];
  const conhecida = POR_NOME.get(chave(nome));
  return rotulo({ nome: conhecida && conhecida.uf === uf ? conhecida.nome : nomeDoLugar(nome), uf, estado: false });
}

/**
 * O nome de outro estado ou de uma cidade de fora, sozinho ("Minas Gerais", "São Paulo", "estado de São Paulo") ou
 * depois de vírgula, traço ou "em" ("Centro, Uberlândia"). `sozinho`: vale o nome sozinho (quem respondeu "em que
 * bairro" de uma cidade daqui não está falando de outra cidade quando diz "São Paulo": é a Vila São Paulo).
 */
export function nomeDeFora(texto: string, { sozinho = true }: { sozinho?: boolean } = {}): string | null {
  const t = semFim(texto)
    .replace(/^(?:fica\s+)?(?:(?:no|na|em)\s+)?(?:(?:o\s+)?estado\s+(?:de|do|da)\s+|interior\s+(?:de|do|da)\s+|cidade\s+de\s+(?=s[aã]o|rio|belo))?/i, "")
    .trim();
  const inteiro = POR_NOME.get(chave(t));
  if (inteiro && sozinho && !inteiro.tambemBairro) return rotulo(inteiro);
  // o último pedaço, depois de vírgula, traço, barra ou "em"
  const pedacos = t.split(/\s*[,;/–]\s*|\s+-\s+|\s+(?:em|no|na)\s+/i).filter(Boolean);
  if (pedacos.length < 2) return null;
  const ultimo = POR_NOME.get(chave(pedacos[pedacos.length - 1]));
  return ultimo ? rotulo(ultimo) : null;
}

/** Só "Goiás" ou "GO" (falta a cidade). */
export function soGoias(texto: string) {
  return /^(?:(?:o\s+)?estado\s+de\s+)?(?:go|goi[aá]s)$/i.test(semFim(texto));
}

/**
 * O texto para quem mandou a vaga de fora. Leva "para publicar aqui mesmo" (MARCA_DO_LUGAR): a resposta seguinte é
 * lida como o lugar, e a vaga que é daqui segue normal.
 */
export function textoForaDaRegiao(lugar: string, comeco = "Pelo que entendi, a vaga é em") {
  return [
    `${comeco} *${lugar}*. Por enquanto, o Publike funciona só em ${ONDE_FUNCIONA}, e não consigo publicar vagas de outras cidades.`,
    "Se o trabalho for numa cidade daqui, me diga o bairro e a cidade para publicar aqui mesmo. Por exemplo: _Setor Bueno, Goiânia_.",
  ].join("\n\n");
}

/**
 * A vaga é de fora de onde o Publike funciona: o rótulo do lugar ("Barueri (SP)"). Vale a marca da leitura ou da
 * conversa e, nas vagas de antes da marca (a da ANPE, "barueri sp, Goiânia"), a sigla de outro estado no bairro ou a
 * cidade que não é das praças.
 */
export function foraDoRascunho(r: Pick<RascunhoConvite, "fora" | "cidade" | "bairro">): string | null {
  if (r.fora?.trim()) return r.fora.trim();
  // a cidade escrita de outro jeito ("Goiânia - GO") não é de fora: só a que mostra outro estado ou é uma cidade de
  // fora conhecida (a que não é das praças e não se reconhece fica para as regras do site, que pedem a cidade da lista)
  const cidade = (r.cidade ?? "").trim();
  if (cidade && !cidadeDoPublike(cidade.replace(/\s*[-/,(]\s*(?:go|goi[aá]s)\)?\s*$/i, ""))) {
    const deFora = siglaDeFora(cidade) ?? POR_NOME.get(chave(semFim(cidade)));
    if (deFora) return typeof deFora === "string" ? deFora : rotulo(deFora);
  }
  const bairro = (r.bairro ?? "").trim();
  return bairro ? (siglaDeFora(bairro) ?? nomeDeFora(bairro, { sozinho: false })) : null;
}
