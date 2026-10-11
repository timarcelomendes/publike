import "server-only";
import { cacheLife } from "next/cache";
import { CENTRO_GOIANIA, MODO_DEMO } from "@/lib/config";
import * as demo from "@/lib/demo";
import { FILTROS_PADRAO } from "@/lib/filtros";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { AnuncioResumo, TipoAnuncio } from "@/lib/tipos";

/**
 * Os anúncios no ar de um tipo na região toda (até 200, os mais novos primeiro),
 * para as páginas de busca por cidade e área. Sem sessão (o mesmo para todo mundo),
 * guardado por alguns minutos.
 */
export async function anunciosNoAr(tipo: TipoAnuncio): Promise<AnuncioResumo[]> {
  "use cache";
  cacheLife("minutes");
  if (MODO_DEMO) {
    return demo.buscarDemo({ ...FILTROS_PADRAO, tipo, raio: 100, ordem: "recentes" }, Date.now(), null);
  }
  const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
    p_lat: CENTRO_GOIANIA.lat,
    p_lng: CENTRO_GOIANIA.lng,
    p_raio_km: 100,
    p_tipo: tipo,
    p_ordem: "recentes",
    p_limite: 200,
  });
  if (error) {
    console.error(`Publike: falha ao ler os anúncios da página de busca: ${error.message}`);
    return [];
  }
  return data ?? [];
}
