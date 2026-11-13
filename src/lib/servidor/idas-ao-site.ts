import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// As idas ao site da empresa (migração 20270513120000): cada toque em "Candidatar no site da empresa". Quem tem conta
// vê as vagas em Minhas curtidas ("Fui para o site"); quem publicou e a equipe veem os números. Antes da migração,
// tudo vem vazio.

export type IdaAoSite = { anuncio_id: string; titulo: string; empresa: string; status: string; link: string; em: string };

/** As vagas do site que a pessoa abriu (as 60 mais recentes, uma por vaga). */
export async function minhasIdasAoSite(): Promise<IdaAoSite[]> {
  if (MODO_DEMO) return [];
  const { data, error } = await (await criarClienteServidor()).rpc("minhas_idas_ao_site");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: não deu para ler as idas ao site: ${error.message}`);
    return [];
  }
  return data ?? [];
}

/** Quando a pessoa abriu o site desta vaga (null: nunca, ou sem conta). */
export async function minhaIdaAoSite(anuncioId: string): Promise<string | null> {
  if (!UUID.test(anuncioId)) return null;
  return (await minhasIdasAoSite()).find((i) => i.anuncio_id === anuncioId)?.em ?? null;
}

export type IdasDaVaga = { total: number; semana: number; pessoas: number };

/** Para quem publicou (e a equipe): quantos toques cada vaga teve, nos últimos 7 dias e de quantas pessoas com conta. */
export async function idasAoSiteDasVagas(ids: string[]): Promise<Map<string, IdasDaVaga>> {
  const validos = ids.filter((id) => UUID.test(id)).slice(0, 200);
  if (MODO_DEMO || !validos.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("idas_ao_site_das_vagas", { p_ids: validos });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: não deu para contar as idas ao site: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((l) => [l.anuncio_id, { total: l.total, semana: l.semana, pessoas: l.pessoas }]));
}
