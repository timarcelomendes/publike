import { CATEGORIAS, CIDADES, type Categoria } from "./constantes";
import { PRACAS } from "./pracas";
import type { TipoAnuncio } from "./tipos";

// Páginas para quem procura no Google: "vagas de emprego em Goiânia",
// "vagas de limpeza em Aparecida de Goiânia", "diarista em Goiânia"...
//   /vagas/[cidade]            /vagas/[cidade]/[area]
//   /servicos/[cidade]         /servicos/[cidade]/[area]
// A área é o slug da categoria da busca (comercio, limpeza, construcao...).

export function slugDaCidade(cidade: string) {
  return cidade
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cidadeDoSlug(slug: string): string | null {
  return CIDADES.find((c) => slugDaCidade(c) === slug) ?? null;
}

export function areaDoSlug(slug: string): (typeof CATEGORIAS)[number] | null {
  return CATEGORIAS.find((c) => c.slug === slug) ?? null;
}

/** As cidades com página própria no rodapé e nos links (as maiores de cada praça). */
export const CIDADES_PRINCIPAIS: string[] = PRACAS.flatMap((p) => [p.cidade, ...p.vizinhas]);

export const PASTA: Record<TipoAnuncio, "vagas" | "servicos"> = { vaga: "vagas", servico: "servicos" };

export function caminhoDaBusca(tipo: TipoAnuncio, cidade: string, area?: Categoria | null) {
  return `/${PASTA[tipo]}/${slugDaCidade(cidade)}${area ? `/${area}` : ""}`;
}

/** A página das vagas de um bairro: /vagas/goiania/bairro/setor-bueno. */
export function caminhoDoBairro(cidade: string, bairro: string) {
  return `/vagas/${slugDaCidade(cidade)}/bairro/${slugDaCidade(bairro)}`;
}

/** As vagas novas da cidade (claude/plano-vagas-dos-ultimos-3-dias.md): /vagas/goiania/ultimos-3-dias. */
/** O bairro entra no Google (e no sitemap) com pelo menos estas vagas no ar; com menos, noindex (17/11/2026). */
export const MINIMO_DO_BAIRRO = 2;

export const SLUG_RECENTES = "ultimos-3-dias";
export const DIAS_RECENTES = 3;
export function caminhoDasRecentes(cidade: string) {
  return `/vagas/${slugDaCidade(cidade)}/${SLUG_RECENTES}`;
}

/** Estágio e jovem aprendiz da cidade (claude/plano-estagio-e-jovem-aprendiz.md): /vagas/goiania/estagio-e-... */
export const SLUG_PROGRAMAS = "estagio-e-jovem-aprendiz";
export const REGIMES_PROGRAMAS = ["estagio", "aprendiz", "trainee"];
export function caminhoDosProgramas(cidade: string) {
  return `/vagas/${slugDaCidade(cidade)}/${SLUG_PROGRAMAS}`;
}

/**
 * Contábil, fiscal e departamento pessoal (27/11/2026; Marcelo: "queria que os perfis mais qualificados também
 * chegassem, contábil e fiscal tem muita vaga"): /vagas/goiania/contabil-fiscal-e-dp, com as vagas da área na região.
 * É a página do Google, do anúncio da área e da lista que vai às faculdades e ao CRC-GO.
 */
export const SLUG_CONTABIL = "contabil-fiscal-e-dp";
export function caminhoDaAreaContabil(cidade: string) {
  return `/vagas/${slugDaCidade(cidade)}/${SLUG_CONTABIL}`;
}
const AREA_CONTABIL =
  /\b(contab\w*|contador\w*|fiscal|fiscais|tribut\w*|faturament\w*|financeir\w*|departamento pessoal|dp|controladoria|contas a (pagar|receber)|tesouraria|auditor\w*|custos|escrita fiscal|folha de pagamento)\b/;
/** O título da vaga é da área contábil, fiscal, financeira ou de departamento pessoal. */
export function vagaDaAreaContabil(titulo: string) {
  const t = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // "fiscal de loja" e "fiscal de prevenção" são de segurança, não do fiscal tributário
  if (/fiscal de (loja|caixa|prevencao|piso|obra|patio|salao)/.test(t)) return false;
  return AREA_CONTABIL.test(t);
}

/**
 * As vagas de hoje na cidade, com os números do dia (claude/plano-organico.md, item 2): /vagas/goiania/hoje. É a
 * página que as IAs e a busca "vagas de emprego em Goiânia hoje" citam.
 */
export const SLUG_HOJE = "hoje";
export function caminhoDeHoje(cidade: string) {
  return `/vagas/${slugDaCidade(cidade)}/${SLUG_HOJE}`;
}

/**
 * Para quem contrata (21/11/2026; Marcelo: "quero que o orgânico funcione melhor para pessoas que publicam vagas"):
 * /anunciar-vaga/goiania, a página da busca "anunciar vaga de emprego grátis em Goiânia" e das IAs.
 */
export function caminhoDeAnunciar(cidade: string) {
  return `/anunciar-vaga/${slugDaCidade(cidade)}`;
}

/** "em Goiânia", "em Aparecida de Goiânia". */
export function emCidade(cidade: string) {
  return `em ${cidade}`;
}

/** Título da página (o h1 e o <title>). */
export function tituloDaBusca(tipo: TipoAnuncio, cidade: string, areaNome: string | null) {
  if (tipo === "vaga") {
    return areaNome ? `Vagas de ${areaNome.toLowerCase()} ${emCidade(cidade)}` : `Vagas de emprego ${emCidade(cidade)}`;
  }
  return areaNome ? `${areaNome}: profissionais ${emCidade(cidade)}` : `Serviços e profissionais ${emCidade(cidade)}`;
}

/** Texto de abertura, com o número de anúncios no ar. */
export function introDaBusca(tipo: TipoAnuncio, cidade: string, areaNome: string | null, total: number) {
  const area = areaNome ? ` de ${areaNome.toLowerCase()}` : "";
  if (tipo === "vaga") {
    const quantas =
      total === 0
        ? `Ainda não há vagas${area} no ar ${emCidade(cidade)}.`
        : `${total === 1 ? "1 vaga" : `${total} vagas`}${area} no ar ${emCidade(cidade)} agora.`;
    return `${quantas} Com carteira, temporárias, diárias e freelances, de empresas, comércios e famílias da região. Cada vaga mostra a distância e o tempo de ônibus de casa. Curtiu, deu match, vocês conversam. Grátis.`;
  }
  const quantos =
    total === 0
      ? `Ainda não há profissionais${area} com vitrine ${emCidade(cidade)}.`
      : `${total === 1 ? "1 profissional" : `${total} profissionais`}${area} ${emCidade(cidade)}.`;
  return `${quantos} Veja fotos dos trabalhos, o preço e as avaliações de quem já contratou, e peça para contratar. O WhatsApp aparece quando o profissional aceita. Grátis.`;
}

/** Descrição curta para o Google (meta description). */
export function descricaoDaBusca(tipo: TipoAnuncio, cidade: string, areaNome: string | null, total: number) {
  const area = areaNome ? ` de ${areaNome.toLowerCase()}` : "";
  if (tipo === "vaga") {
    return `${total > 0 ? `${total} vagas${area}` : `Vagas${area}`} ${emCidade(cidade)} (GO): carteira assinada, diárias, temporárias e freelances perto de casa, com o tempo de ônibus. Candidate-se grátis pelo Publike.`;
  }
  return `${areaNome ?? "Profissionais"} ${emCidade(cidade)} (GO): veja fotos, preço e avaliações e contrate quem mora perto. Grátis pelo Publike.`;
}
