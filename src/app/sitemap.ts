import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
import { CONTEUDOS } from "@/lib/conteudos";
import { noticiasPublicadas } from "@/lib/servidor/noticias";
import { caminhoDaBusca, cidadeDoSlug, CIDADES_PRINCIPAIS, slugDaCidade } from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { TipoAnuncio } from "@/lib/tipos";

/** Páginas de busca por cidade e área: as cidades principais sempre; o resto, se tiver anúncio. */
async function paginasDeBusca(): Promise<MetadataRoute.Sitemap> {
  const lista: MetadataRoute.Sitemap = [];
  for (const tipo of ["vaga", "servico"] as TipoAnuncio[]) {
    const anuncios = await anunciosNoAr(tipo);
    const cidades = new Set(CIDADES_PRINCIPAIS);
    for (const a of anuncios) if (cidadeDoSlug(slugDaCidade(a.cidade))) cidades.add(a.cidade);
    for (const cidade of cidades) {
      const daCidade = anuncios.filter((a) => a.cidade === cidade);
      lista.push({
        url: `${SITE_URL}${caminhoDaBusca(tipo, cidade)}`,
        changeFrequency: "hourly",
        priority: cidade === "Goiânia" ? 0.9 : 0.8,
      });
      for (const c of CATEGORIAS) {
        if (c.slug === "outros" || !daCidade.some((a) => a.categoria === c.slug)) continue;
        lista.push({
          url: `${SITE_URL}${caminhoDaBusca(tipo, cidade, c.slug)}`,
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    }
  }
  return lista;
}

// Lista as páginas para o Google, incluindo os anúncios no ar.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const paginas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/descobrir`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/como-funciona`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/missao`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/gratis`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/empresas`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/profissionais`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/conteudos`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/noticias`, changeFrequency: "daily", priority: 0.6 },
    ...CONTEUDOS.map((c) => ({
      url: `${SITE_URL}/conteudos/${c.slug}`,
      lastModified: c.publicado,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
  if (MODO_DEMO) return paginas;

  const { data } = await criarClientePublico()
    .from("anuncios")
    .select("id, atualizado_em")
    .eq("status", "ativo")
    .gt("expira_em", new Date().toISOString())
    .order("criado_em", { ascending: false })
    .limit(5000);

  return [
    ...paginas,
    ...(await paginasDeBusca()),
    ...(await noticiasPublicadas(500)).map((n) => ({
      url: `${SITE_URL}/noticias/${n.slug}`,
      lastModified: n.publicar_em ? new Date(n.publicar_em).toISOString() : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...(data ?? []).map((a) => ({
      url: `${SITE_URL}/anuncio/${a.id}`,
      // data no formato curto e padrão (o Google lê melhor que microssegundos com fuso)
      lastModified: new Date(a.atualizado_em).toISOString(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
