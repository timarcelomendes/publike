import "server-only";
import { lerEtapasProprias, lerFaixas, type EtapaPropria, type FaixaLivre } from "@/lib/etapas-proprias";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Etapas próprias, desde quando e horários livres (migração 20270108120000). null: sem a migração.

export async function etapasProprias(): Promise<EtapaPropria[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("etapas_proprias");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as etapas próprias: ${error.message}`);
    return null;
  }
  return lerEtapasProprias(data);
}

export async function ondeEstaDesde(
  anuncioId: string,
): Promise<Map<string, { subetapa: string | null; desde: string }> | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("onde_esta_desde", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler desde quando: ${error.message}`);
    return null;
  }
  return new Map((data ?? []).map((x) => [x.perfil_id, { subetapa: x.subetapa, desde: x.desde }]));
}

export async function horariosLivres(): Promise<FaixaLivre[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("meus_horarios_livres");
  if (error) return null;
  return lerFaixas(data);
}
