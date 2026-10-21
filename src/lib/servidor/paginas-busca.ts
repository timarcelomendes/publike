import "server-only";
import { cacheLife } from "next/cache";
import { CENTRO_GOIANIA, MODO_DEMO } from "@/lib/config";
import * as demo from "@/lib/demo";
import { FILTROS_PADRAO } from "@/lib/filtros";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { AnuncioResumo, TipoAnuncio } from "@/lib/tipos";
import { fotosDosAutores } from "./fotos-autores";

/** Um anúncio no ar, com o logo de quem publicou (a foto do perfil). */
export type AnuncioNoAr = AnuncioResumo & { autor_foto: string | null };

/**
 * Os anúncios no ar de um tipo na região toda (até 200, os mais novos primeiro),
 * para as páginas de busca por cidade e área. Sem sessão (o mesmo para todo mundo),
 * guardado por alguns minutos.
 */
export async function anunciosNoAr(tipo: TipoAnuncio): Promise<AnuncioNoAr[]> {
  "use cache";
  cacheLife("minutes");
  if (MODO_DEMO) {
    const lista = demo.buscarDemo({ ...FILTROS_PADRAO, tipo, raio: 100, ordem: "recentes" }, Date.now(), null);
    return lista.map((a) => ({ ...a, autor_foto: null }));
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
  const lista = data ?? [];
  const logos = await fotosDosAutores(lista.map((a) => a.autor_id));
  return lista.map((a) => ({ ...a, autor_foto: logos[a.autor_id] ?? null }));
}
