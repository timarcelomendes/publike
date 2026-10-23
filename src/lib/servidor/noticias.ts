import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import type { Noticia } from "@/lib/noticias";
import { criarClientePublico } from "@/lib/supabase/servidor";

// As notícias publicadas (o banco só entrega as aprovadas que já chegaram no
// horário). Iguais para todo mundo: ficam guardadas por alguns minutos.

const CAMPOS =
  "id, slug, titulo, resumo, corpo, pratico, tema, cidade, fonte_nome, fonte_url, fonte_data, status, publicar_em, criado_em, foto_url, foto_autor, foto_autor_url, foto_link, foto_alt, foto_fonte, foto_licenca, foto_licenca_url";

export async function noticiasPublicadas(limite = 60): Promise<Noticia[]> {
  "use cache";
  // 15 minutos ("default"): com "minutes", a página era regravada a cada minuto na Vercel
  cacheLife("default");
  cacheTag("noticias");
  if (MODO_DEMO) return [];
  const { data, error } = await criarClientePublico()
    .from("noticias")
    .select(CAMPOS)
    .order("publicar_em", { ascending: false })
    .limit(limite);
  if (error) {
    console.error(`Publike: falha ao ler as notícias: ${error.message}`);
    return [];
  }
  return (data ?? []) as Noticia[];
}

export async function noticiaDoSlug(slug: string): Promise<Noticia | null> {
  "use cache";
  // 15 minutos ("default"): com "minutes", a página era regravada a cada minuto na Vercel
  cacheLife("default");
  cacheTag("noticias");
  if (MODO_DEMO || !/^[a-z0-9-]{3,90}$/.test(slug)) return null;
  const { data } = await criarClientePublico().from("noticias").select(CAMPOS).eq("slug", slug).maybeSingle();
  return (data as Noticia | null) ?? null;
}
