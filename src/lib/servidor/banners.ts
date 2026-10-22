import "server-only";
import { cookies } from "next/headers";
import {
  COOKIE_BANNERS,
  diaDeHoje,
  juntarVistos,
  lerBannersVistos,
  podeMostrar,
  type AcaoBanner,
  type BannerNoAr,
  type Visto,
} from "@/lib/banners";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

/**
 * O banner da página inicial para quem chega: o mais novo ligado (dentro das datas) para o público
 * dela (visitante, conta de pessoa ou de empresa) que pode aparecer: nunca visto, ou com repetição e
 * já passados os dias (sem ter tocado no botão). Conta o que o navegador e a conta (em qualquer
 * aparelho) já viram. Sem nenhum, null.
 */
export async function bannerDaHome(): Promise<BannerNoAr | null> {
  if (MODO_DEMO) return null;
  const [usuario, jar, agora] = await Promise.all([obterUsuario(), cookies(), agoraDaRequisicao()]);
  const perfil = usuario ? await obterMeuPerfil().catch(() => null) : null;
  const publicos = ["todos"];
  if (!usuario) publicos.push("visitantes");
  else if (perfil) publicos.push(perfil.tipo === "pessoa" ? "pessoas" : "empresas");
  // o banco só devolve os ligados e dentro das datas (RLS)
  const { data, error } = await criarClientePublico()
    .from("banners")
    .select("id, titulo, texto, botao, acao, link, repetir_dias")
    .in("publico", publicos)
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error || !data?.length) return null; // sem a migração: nenhum banner
  const doNavegador = lerBannersVistos(jar.get(COOKIE_BANNERS)?.value);
  const daConta = new Map<string, Visto>();
  if (usuario) {
    const { data: vistos } = await (
      await criarClienteServidor()
    )
      .from("banners_vistos")
      .select("banner_id, visto_em, clicou")
      .in(
        "banner_id",
        data.map((b) => b.id),
      );
    for (const v of vistos ?? [])
      daConta.set(v.banner_id, { dia: diaDeHoje(Date.parse(v.visto_em)), clicou: v.clicou });
  }
  const hoje = diaDeHoje(agora);
  const banner = data.find((b) =>
    podeMostrar(b.repetir_dias, juntarVistos(doNavegador.get(b.id), daConta.get(b.id)), hoje),
  );
  return banner ? { ...banner, acao: banner.acao as AcaoBanner } : null;
}
