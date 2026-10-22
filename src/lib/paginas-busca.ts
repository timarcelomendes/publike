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
