import { CATEGORIAS } from "./constantes";
import { formatarLugar, formatarMoeda } from "./formato";
import { ONDE_FUNCIONA, PRACAS, pracaDaCidade } from "./pracas";
import { POR_UNIDADE } from "./valor-do-tiquete";

// Admin › Vagas do dia: as vagas novas no ar viram o post do Instagram de cada dia, sem fazer nada à mão.
// O carrossel do feed (1080 × 1350: a capa, uma vaga por imagem e o "como se candidatar"), um story por vaga
// (1080 × 1920, com espaço para o adesivo de link) e a legenda pronta. Aqui fica o que o navegador e o servidor
// usam juntos; as imagens saem de src/lib/servidor/imagens-do-dia.tsx.

/** Uma vaga como entra nas imagens e na legenda. */
export type VagaDoDia = {
  id: string;
  titulo: string;
  /** a área da vaga (o slug de CATEGORIAS), para filtrar */
  categoria: string | null;
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

/** Os períodos, cada um com o título que sugere para o post (dá para trocar). */
export const PERIODOS_DO_DIA = [
  { valor: "24h", nome: "Hoje", horas: 24, titulo: "Vagas do dia" },
  { valor: "3d", nome: "3 dias", horas: 72, titulo: "Vagas novas" },
  { valor: "7d", nome: "Semana", horas: 168, titulo: "Vagas da semana" },
  { valor: "15d", nome: "15 dias", horas: 360, titulo: "Vagas da quinzena" },
] as const;
export type PeriodoDoDia = (typeof PERIODOS_DO_DIA)[number]["valor"];

// Os filtros de Admin › Vagas do dia (claude/plano-vagas-do-dia-por-area.md): a área (uma ou mais), a praça, só as
// que dizem o salário e o jeito de contratar. Ficam no endereço (?area=alimentacao,comercio&cidade=anapolis…).

export const CIDADES_DO_DIA = [
  { valor: "todas", nome: "Todas", cidade: null },
  { valor: "goiania", nome: "Goiânia e região", cidade: "Goiânia" },
  { valor: "anapolis", nome: "Anápolis e região", cidade: "Anápolis" },
] as const;
export const CONTRATACOES_DO_DIA = [
  { valor: "todas", nome: "Todas" },
  { valor: "carteira", nome: "Com carteira" },
  { valor: "freela", nome: "Freela e diária" },
] as const;
/** Com carteira: CLT, aprendiz, temporário, intermitente e trainee. */
const DE_CARTEIRA = new Set(["clt", "aprendiz", "temporario", "intermitente", "trainee"]);
/** Freela e diária: por dia, por tarefa, por produção ou autônomo. */
const DE_FREELA = new Set(["diaria", "freelance", "produtividade", "autonomo"]);

export type FiltrosDoDia = {
  areas: string[];
  cidade: (typeof CIDADES_DO_DIA)[number]["valor"];
  comSalario: boolean;
  contratacao: (typeof CONTRATACOES_DO_DIA)[number]["valor"];
};

/** Os filtros do endereço: só os valores conhecidos. */
export function lerFiltrosDoDia(sp: {
  area?: string | null;
  cidade?: string | null;
  salario?: string | null;
  contratacao?: string | null;
}): FiltrosDoDia {
  const areas = [...new Set((sp.area ?? "").split(",").map((a) => a.trim()))].filter((a) =>
    CATEGORIAS.some((c) => c.slug === a),
  );
  const cidade = CIDADES_DO_DIA.find((c) => c.valor === sp.cidade)?.valor ?? "todas";
  const contratacao = CONTRATACOES_DO_DIA.find((c) => c.valor === sp.contratacao)?.valor ?? "todas";
  return { areas, cidade, comSalario: sp.salario === "1", contratacao };
}

/** As vagas que passam nos filtros (`semArea`: sem olhar a área, para contar quantas há em cada uma). */
export function filtrarVagasDoDia<T extends Pick<VagaDoDia, "categoria" | "cidade" | "pagamento_valor" | "regime">>(
  vagas: T[],
  f: FiltrosDoDia,
  semArea = false,
): T[] {
  const praca = CIDADES_DO_DIA.find((c) => c.valor === f.cidade);
  return vagas.filter(
    (v) =>
      (semArea || !f.areas.length || (v.categoria != null && f.areas.includes(v.categoria))) &&
      (!praca?.cidade || pracaDaCidade(v.cidade)?.cidade === praca.cidade) &&
      (!f.comSalario || v.pagamento_valor != null) &&
      (f.contratacao === "todas" ||
        (f.contratacao === "carteira" ? DE_CARTEIRA.has(v.regime ?? "") : DE_FREELA.has(v.regime ?? ""))),
  );
}

/** Onde, para a capa e a legenda: "Goiânia e região", "Anápolis e região" ou, com todas, "Goiânia, Anápolis e região". */
export function lugarDoDia(cidade: FiltrosDoDia["cidade"]) {
  const praca = CIDADES_DO_DIA.find((c) => c.valor === cidade);
  return praca?.cidade ? (PRACAS.find((p) => p.cidade === praca.cidade)?.nome ?? praca.nome) : ONDE_FUNCIONA;
}

/** O título do post pode ter até 32 letras (cabe na capa em duas linhas). */
export const MAX_TITULO_DO_DIA = 32;

/**
 * O título escrito à mão, limpo: letras, números e a pontuação comum (emoji e símbolos não existem na fonte das
 * imagens), sem espaço sobrando, até 32 letras (cortado na palavra inteira). null: vazio.
 */
export function limparTituloDoDia(t: string | null | undefined): string | null {
  const limpo = (t ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .,!?:;'"“”‘’()&+%/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length <= MAX_TITULO_DO_DIA) return limpo || null;
  // grande demais: corta na última palavra inteira (sem "para quem es")
  const cortado = limpo.slice(0, MAX_TITULO_DO_DIA);
  const espaco = cortado.lastIndexOf(" ");
  return (espaco > 12 ? cortado.slice(0, espaco) : cortado).replace(/[\s,;:–-]+$/, "");
}

/** O título sugerido para a área marcada: "Vagas de alimentação". */
export function tituloDaArea(area: string) {
  const c = CATEGORIAS.find((x) => x.slug === area);
  return c ? limparTituloDoDia(`Vagas de ${c.nome.charAt(0).toLowerCase()}${c.nome.slice(1)}`) : null;
}

/** Quando: hoje, "quinta, 5 de novembro"; nos outros períodos, "2 a 8 de novembro" (ou "28 de outubro a 5 de novembro"). */
export function quandoDoDia(horas: number, agora: number) {
  if (horas <= 24) return diaPorExtenso(agora);
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const inicio = new Date(agora - horas * 3600 * 1000);
  const fim = new Date(agora);
  const mes = (d: Date) => new Intl.DateTimeFormat("pt-BR", { ...fuso, month: "long" }).format(d);
  const diaDe = (d: Date) => new Intl.DateTimeFormat("pt-BR", { ...fuso, day: "numeric" }).format(d);
  return mes(inicio) === mes(fim)
    ? `${diaDe(inicio)} a ${diaDe(fim)} de ${mes(fim)}`
    : `${diaDe(inicio)} de ${mes(inicio)} a ${diaDe(fim)} de ${mes(fim)}`;
}

/** O que vai na capa: o título, onde, quando e o selo dos stories ("HOJE" ou "VAGAS NOVAS"). */
export type TextoDaCapa = { titulo: string; lugar: string; quando: string; selo: string };

/** O texto da capa a partir do que está no endereço (o título vazio fica o do período). */
export function textoDaCapa(
  sp: { titulo?: string | null; cidade?: string | null; periodo?: string | null },
  agora: number,
): TextoDaCapa {
  const periodo = PERIODOS_DO_DIA.find((p) => p.valor === sp.periodo) ?? PERIODOS_DO_DIA[0];
  const { cidade } = lerFiltrosDoDia({ cidade: sp.cidade });
  return {
    titulo: limparTituloDoDia(sp.titulo) ?? periodo.titulo,
    lugar: lugarDoDia(cidade),
    quando: quandoDoDia(periodo.horas, agora),
    selo: periodo.horas <= 24 ? "HOJE" : "VAGAS NOVAS",
  };
}

/** Com uma área marcada, a última hashtag vira a da área; em Anápolis, as da cidade. */
const HASHTAG_DA_AREA: Record<string, string> = {
  comercio: "#vagasvendedor",
  alimentacao: "#vagasrestaurante",
  administrativo: "#vagasadministrativo",
  financeiro: "#vagasfinanceiro",
  logistica: "#vagasmotorista",
  construcao: "#vagasconstrucao",
  "eletrica-hidraulica": "#vagaseletricista",
  manutencao: "#vagasmanutencao",
  limpeza: "#vagaslimpeza",
  cuidados: "#vagascuidador",
  saude: "#vagassaude",
  beleza: "#vagasbeleza",
  moda: "#vagascostureira",
  educacao: "#vagasprofessor",
  esporte: "#vagasacademia",
  tecnologia: "#vagasti",
  marketing: "#vagasmarketing",
  industria: "#vagasindustria",
};

export function hashtagsDoDia(f: Pick<FiltrosDoDia, "areas" | "cidade">) {
  const base =
    f.cidade === "anapolis"
      ? ["#vagasanapolis", "#empregoanapolis", "#anapolis", "#vagasdeemprego", "#trabalhoanapolis"]
      : HASHTAGS_DO_DIA.split(" ");
  const daArea = f.areas.map((a) => HASHTAG_DA_AREA[a]).find(Boolean);
  return (daArea ? [...base.slice(0, 4), daArea] : base).join(" ");
}

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
export function legendaDoDia(vagas: VagaDoDia[], dia: string, titulo?: string, hashtags: string = HASHTAGS_DO_DIA) {
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
      hashtags,
    ].join("\n");
  };
  let mostradas = vagas.length;
  let texto = montar(mostradas);
  while (texto.length > MAX_LEGENDA && mostradas > 1) texto = montar(--mostradas);
  return texto;
}

/** A primeira linha da legenda do Publike: "Vagas da semana em Goiânia e região (2 a 8 de novembro)". */
export function tituloDaLegenda(t: TextoDaCapa) {
  return `${t.titulo} em ${t.lugar} (${t.quando})`;
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
/** O link do último story ("mais vagas"): todas as vagas, contado como dos stories (e não da bio). */
export const linkDoFimDosStories = (site: string) => linkDoInstagram(site, "/?tipo=vaga", "stories");

/** O texto com o link de cada story, na ordem dos arquivos, e o da bio (vai no .zip). */
export function textoDosLinks(
  vagas: VagaDoDia[],
  linkDaVaga: (id: string) => string,
  bio: string,
  /** o link do último story (sem ele, o da bio) */
  fim: string = bio,
) {
  return [
    "Links para o adesivo de cada story (na ordem dos arquivos da pasta stories):",
    "",
    "00. Capa: sem link",
    "",
    ...vagas.flatMap((v, i) => [`${String(i + 1).padStart(2, "0")}. ${v.titulo}`, linkDaVaga(v.id), ""]),
    `${String(vagas.length + 1).padStart(2, "0")}. Mais vagas:`,
    fim,
    "",
    "Link da bio:",
    bio,
    "",
  ].join("\n");
}
