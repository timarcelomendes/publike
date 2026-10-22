import "server-only";
import { cookies } from "next/headers";
import { COOKIE_BANNERS, lerBannersVistos, type AcaoBanner, type BannerNoAr } from "@/lib/banners";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { criarClientePublico } from "@/lib/supabase/servidor";

/**
 * O banner da página inicial para quem chega: o mais novo ligado (dentro das datas) para o público
 * dela (visitante, conta de pessoa ou de empresa) que este navegador ainda não viu. Sem nenhum, null.
 */
export async function bannerDaHome(): Promise<BannerNoAr | null> {
  if (MODO_DEMO) return null;
  const [usuario, jar] = await Promise.all([obterUsuario(), cookies()]);
  const perfil = usuario ? await obterMeuPerfil().catch(() => null) : null;
  const publicos = ["todos"];
  if (!usuario) publicos.push("visitantes");
  else if (perfil) publicos.push(perfil.tipo === "pessoa" ? "pessoas" : "empresas");
  const vistos = lerBannersVistos(jar.get(COOKIE_BANNERS)?.value);
  // o banco só devolve os ligados e dentro das datas (RLS)
  const { data, error } = await criarClientePublico()
    .from("banners")
    .select("id, titulo, texto, botao, acao, link")
    .in("publico", publicos)
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) return null; // sem a migração: nenhum banner
  const banner = (data ?? []).find((b) => !vistos.has(b.id));
  return banner ? { ...banner, acao: banner.acao as AcaoBanner } : null;
}
