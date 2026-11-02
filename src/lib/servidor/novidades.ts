import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import type { AcaoBanner, BannerNoAr } from "@/lib/banners";
import { MODO_DEMO } from "@/lib/config";
import { COOKIE_NOVIDADES, paraDaNovidade, temNovidadeNova, type ParaNovidade } from "@/lib/novidades";
import { criarClientePublico } from "@/lib/supabase/servidor";

/** `botao` vazio: a novidade não tem link (o cartão fica sem botão). */
export type Novidade = BannerNoAr & { quando: string; para: ParaNovidade };

/**
 * As novidades do Publike (as de Admin › Novidades e os banners marcados), da mais nova para a mais antiga
 * (as mesmas para todo mundo: ficam guardadas por alguns minutos). Sem a migração 20270118120000, nenhuma.
 */
export async function novidadesDoPublike(): Promise<Novidade[]> {
  "use cache";
  cacheLife("default");
  cacheTag("novidades");
  if (MODO_DEMO) return [];
  const { data, error } = await criarClientePublico().rpc("novidades_do_publike");
  if (error) {
    // sem a migração (a função não existe): a página fica vazia, sem barulho
    if (error.code !== "PGRST202" && error.code !== "42883")
      console.error(`Publike: falha ao ler as novidades: ${error.message}`);
    return [];
  }
  return (data ?? []).map((n) => ({
    id: n.id,
    titulo: n.titulo,
    texto: n.texto,
    botao: n.botao ?? "",
    acao: n.acao as AcaoBanner,
    link: n.link,
    repetir_dias: null,
    paginas: [],
    atraso: 0,
    imagem: n.imagem,
    formato: "cartao",
    novidades: true,
    quando: n.quando,
    para: paraDaNovidade(n.para),
  }));
}

/** Para o menu da conta: tem novidade que a pessoa ainda não viu em /novidades? */
export async function haNovidadeNova(): Promise<boolean> {
  const [lista, jar] = await Promise.all([novidadesDoPublike().catch(() => []), cookies()]);
  return temNovidadeNova(lista[0]?.quando ?? null, jar.get(COOKIE_NOVIDADES)?.value);
}
