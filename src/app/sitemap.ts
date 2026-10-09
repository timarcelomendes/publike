import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

// Lista as páginas para o Google, incluindo os anúncios no ar.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const paginas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/como-funciona`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/missao`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
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
    ...(data ?? []).map((a) => ({
      url: `${SITE_URL}/anuncio/${a.id}`,
      lastModified: a.atualizado_em,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
