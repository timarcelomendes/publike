import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { lerAvisoDeTempo } from "@/lib/tempo-na-pagina";

// O tempo na página (src/components/contar-tempo.tsx): o navegador avisa quanto tempo a página ficou na tela
// (navigator.sendBeacon, que chega mesmo fechando a aba). O banco só soma por dia e por página, sem guardar
// quem (`contar_tempo`, que confere tudo de novo).

// a mesma lista do proxy (src/proxy.ts)
const ROBO =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;

export async function POST(request: Request) {
  if (MODO_DEMO || ROBO.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  // só o próprio site avisa
  const de = request.headers.get("sec-fetch-site");
  if (de && de !== "same-origin") return new Response(null, { status: 204 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const aviso = lerAvisoDeTempo(corpo);
  if (!aviso) return new Response(null, { status: 400 });
  const { error } = await criarClientePublico().rpc("contar_tempo", {
    p_pagina: aviso.pagina,
    p_de: aviso.de,
    p_ate: aviso.ate,
  });
  // sem a migração 20261208120000, o banco ainda não tem a função: só não conta
  if (error && error.code !== "PGRST202") {
    console.error(`Publike: não deu para contar o tempo na página: ${error.message}`);
  }
  return new Response(null, { status: 204 });
}
