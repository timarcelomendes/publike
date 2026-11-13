import { cookies } from "next/headers";
import { MODO_DEMO } from "@/lib/config";
import { ehPassoDoImpulso } from "@/lib/impulso-passos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O caminho de quem chegou pelo anúncio do impulso (src/lib/impulso-passos.ts): o quadro de curtir avisa cada passo
// (navigator.sendBeacon, sem atrasar a curtida). Só conta com o cookie publike_impulso desta vaga; o banco confere tudo
// de novo (`contar_passo_do_impulso`) e conta cada passo uma vez por visitante.

const CODIGO = /^[a-z0-9]{6,20}$/;
const VISITANTE = /^[A-Za-z0-9_-]{16,64}$/;

export async function POST(request: Request) {
  const nada = new Response(null, { status: 204 });
  if (MODO_DEMO) return nada;
  // só o próprio site avisa
  const de = request.headers.get("sec-fetch-site");
  if (de && de !== "same-origin") return nada;
  // sem o cookie do anúncio (quase todo mundo): nem abre o banco
  const [codigo, visitante] = ((await cookies()).get("publike_impulso")?.value ?? "").split(".");
  if (!codigo || !visitante || !CODIGO.test(codigo) || !VISITANTE.test(visitante)) return nada;
  let corpo: { anuncio?: unknown; passo?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return new Response(null, { status: 400 });
  }
  const { anuncio, passo } = corpo ?? {};
  if (typeof anuncio !== "string" || !UUID.test(anuncio) || !ehPassoDoImpulso(passo)) {
    return new Response(null, { status: 400 });
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("contar_passo_do_impulso", {
    p_codigo: codigo,
    p_visitante: visitante,
    p_anuncio: anuncio,
    p_passo: passo,
  });
  // sem a migração 20270505120000, o banco ainda não tem a função: só não conta
  if (error && error.code !== "PGRST202") console.error(`Publike: não deu para contar o passo do impulso: ${error.message}`);
  return nada;
}
