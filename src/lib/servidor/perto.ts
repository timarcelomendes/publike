import "server-only";
import { cookies } from "next/headers";
import { primeiro } from "@/lib/formato";
import { COOKIE_PERTO, lerPerto } from "@/lib/perto-guardado";

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Os parâmetros da página com o "Perto de mim" guardado (cookie de 24 horas): sem um ponto na URL,
 * a busca conta de onde a pessoa estava, como se ela tivesse tocado em "Perto de mim" agora. Com um
 * ponto na URL (o mapa ou o próprio "Perto de mim"), vale o da URL.
 */
export async function comPertoGuardado(sp: Parametros): Promise<Parametros> {
  if (primeiro(sp.origem) || primeiro(sp.lat) || primeiro(sp.lng)) return sp;
  const ponto = lerPerto((await cookies()).get(COOKIE_PERTO)?.value);
  return ponto ? { ...sp, lat: String(ponto.lat), lng: String(ponto.lng), origem: "gps" } : sp;
}
