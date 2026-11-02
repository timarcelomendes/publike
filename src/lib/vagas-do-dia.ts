import { formatarLugar, formatarMoeda } from "./formato";
import { POR_UNIDADE } from "./valor-do-tiquete";

// Admin › Vagas do dia: as vagas novas no ar viram o post do Instagram de cada dia, sem fazer nada à mão.
// O carrossel do feed (1080 × 1350: a capa, uma vaga por imagem e o "como se candidatar"), um story por vaga
// (1080 × 1920, com espaço para o adesivo de link) e a legenda pronta. Aqui fica o que o navegador e o servidor
// usam juntos; as imagens saem de src/lib/servidor/imagens-do-dia.tsx.

/** Uma vaga como entra nas imagens e na legenda. */
export type VagaDoDia = {
  id: string;
  titulo: string;
  regime: string | null;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  pagamento_ate: number | null;
  comissao: boolean;
  cidade: string;
  bairro: string;
  vagas: number;
  beneficios_lista: string[];
  comeca_ja: boolean;
  criado_em: string;
  /** quem contrata: a empresa, o comércio ou "Empresa confidencial"; vaga de pessoa física fica sem nome */
  quem: string | null;
  /** vaga de agência: o nome da agência que faz a seleção */
  agencia: string | null;
  /** a conta que publicou tem o selo de conferida */
  verificada: boolean;
};

export const PERIODOS_DO_DIA = [
  { valor: "24h", nome: "Últimas 24 horas", horas: 24 },
  { valor: "3d", nome: "3 dias", horas: 72 },
  { valor: "7d", nome: "7 dias", horas: 168 },
] as const;
export type PeriodoDoDia = (typeof PERIODOS_DO_DIA)[number]["valor"];

/** O carrossel do Instagram aceita até 20 imagens: a capa, as vagas e o fechamento. */
export const MAX_VAGAS_DO_DIA = 18;
/** Quantas já vêm marcadas ao abrir: o bastante para o carrossel render sem cansar. */
export const VAGAS_MARCADAS = 10;
/** O limite de hashtags por post do Instagram. */
export const HASHTAGS_DO_DIA = "#vagasgoiania #empregogoiania #goiania #vagasdeemprego #trabalhogoiania";
/** O Instagram corta a legenda em 2.200 letras. */
const MAX_LEGENDA = 2200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As vagas escolhidas, do endereço (?v=id,id…): só códigos válidos, sem repetir, até o máximo. */
export function lerIdsDoDia(valor: string | null | undefined): string[] {
  if (!valor) return [];
  const ids = valor
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID.test(s));
  return [...new Set(ids)].slice(0, MAX_VAGAS_DO_DIA);
}

/** A ordem de quando abre: as que dizem quanto pagam primeiro (chamam mais), depois as mais novas. */
export function ordenarVagasDoDia<T extends Pick<VagaDoDia, "pagamento_valor" | "criado_em">>(vagas: T[]): T[] {
  return [...vagas].sort(
    (a, b) =>
      Number(b.pagamento_valor != null) - Number(a.pagamento_valor != null) || b.criado_em.localeCompare(a.criado_em),
  );
}

/** "segunda, 2 de novembro", no horário de Brasília. */
export function diaPorExtenso(agora: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(agora))
    .replace("-feira", "");
}

/** "2026-11-02", no horário de Brasília: para o nome do .zip. */
export function diaEmNumeros(agora: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
}

/** "R$ 1.890 por mês", "De R$ 1.800 a R$ 2.200 por mês", "R$ 150 a diária" ou "A combinar". */
export function valorDaVagaDoDia(v: Pick<VagaDoDia, "pagamento_valor" | "pagamento_ate" | "pagamento_unidade">) {
  if (v.pagamento_valor == null || !v.pagamento_unidade) return "A combinar";
  const ate = v.pagamento_ate != null && v.pagamento_ate > v.pagamento_valor ? v.pagamento_ate : null;
  const valor = ate
    ? `De ${formatarMoeda(v.pagamento_valor)} a ${formatarMoeda(ate)}`
    : formatarMoeda(v.pagamento_valor);
  const unidade = POR_UNIDADE[v.pagamento_unidade];
  return unidade ? `${valor} ${unidade}` : valor;
}

/** "Repositor de bebidas: R$ 1.784,19 por mês, Setor Central" */
export function linhaDaVaga(v: VagaDoDia) {
  return `${v.titulo}: ${valorDaVagaDoDia(v)}, ${formatarLugar(v.bairro, v.cidade)}`;
}

/**
 * A legenda do carrossel: o título (o do Publike, "Vagas do dia em Goiânia e região (dia)", ou o da empresa), as vagas
 * na ordem das imagens (o número ajuda quem comenta "quero a 3"), como se candidatar, o pedido para mandar a quem
 * procura e até 5 hashtags. Passou do limite do Instagram, as últimas vagas viram "e mais N".
 */
export function legendaDoDia(vagas: VagaDoDia[], dia: string, titulo?: string) {
  const montar = (mostradas: number) => {
    const resto = vagas.length - mostradas;
    return [
      titulo ?? `Vagas do dia em Goiânia e região (${dia})`,
      "",
      ...vagas.slice(0, mostradas).map((v, i) => `${i + 1}. ${linhaDaVaga(v)}`),
      ...(resto > 0 ? [`E mais ${resto} ${resto === 1 ? "vaga" : "vagas"} nas imagens.`] : []),
      "",
      "Para se candidatar: toque no link da bio, entre de graça e curta a vaga. Quem contrata recebe na hora.",
      "Conhece alguém procurando trabalho? Mande este post.",
      "",
      "Nunca pague para conseguir trabalho.",
      "",
      HASHTAGS_DO_DIA,
    ].join("\n");
  };
  let mostradas = vagas.length;
  let texto = montar(mostradas);
  while (texto.length > MAX_LEGENDA && mostradas > 1) texto = montar(--mostradas);
  return texto;
}

/** O título da legenda da empresa: "Loja Bom Preço está contratando: 4 vagas abertas". */
export function tituloDaEmpresa(nome: string, vagas: number) {
  return `${nome} está contratando: ${vagas} ${vagas === 1 ? "vaga aberta" : "vagas abertas"}`;
}

/**
 * O link com a origem do Instagram: quem cria a conta por ele aparece em Admin › Campanhas como
 * "instagram:bio" ou "instagram:stories".
 */
export function linkDoInstagram(site: string, caminho: string, campanha: "bio" | "stories") {
  const url = new URL(caminho, site);
  url.searchParams.set("utm_source", "instagram");
  url.searchParams.set("utm_campaign", campanha);
  return url.toString();
}

/** O link da bio: as vagas do Publike, com a origem do Instagram. */
export const linkDaBio = (site: string) => linkDoInstagram(site, "/?tipo=vaga", "bio");

/** O link do adesivo de cada story: a página da vaga, onde está o Curtir. */
export const linkDoStory = (site: string, id: string) => linkDoInstagram(site, `/anuncio/${id}`, "stories");

/** O texto com o link de cada story, na ordem dos arquivos, e o da bio (vai no .zip). */
export function textoDosLinks(vagas: VagaDoDia[], linkDaVaga: (id: string) => string, bio: string) {
  return [
    "Links para o adesivo de cada story (na ordem dos arquivos da pasta stories):",
    "",
    ...vagas.flatMap((v, i) => [`${String(i + 1).padStart(2, "0")}. ${v.titulo}`, linkDaVaga(v.id), ""]),
    "Link da bio:",
    bio,
    "",
  ].join("\n");
}
