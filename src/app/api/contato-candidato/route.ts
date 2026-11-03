import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// A empresa tocou no WhatsApp, no telefone ou no e-mail de um candidato (src/components/contar-contato.tsx): o
// navegador avisa (navigator.sendBeacon, que chega mesmo indo para outro app) e o banco guarda no histórico da
// candidatura, para Admin › Retorno saber que houve contato. O banco confere de novo que a vaga é da conta.

const CANAIS = new Set(["whatsapp", "telefone", "email"]);

export async function POST(request: Request) {
  if (MODO_DEMO) return new Response(null, { status: 204 });
  // só o próprio site avisa
  const de = request.headers.get("sec-fetch-site");
  if (de && de !== "same-origin") return new Response(null, { status: 204 });
  let corpo: { anuncio?: unknown; perfil?: unknown; canal?: unknown } | null;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const anuncio = String(corpo?.anuncio ?? "");
  const perfil = String(corpo?.perfil ?? "");
  const canal = String(corpo?.canal ?? "");
  if (!UUID.test(anuncio) || !UUID.test(perfil) || !CANAIS.has(canal)) return new Response(null, { status: 400 });
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_contato_candidato", {
    p_anuncio: anuncio,
    p_perfil: perfil,
    p_canal: canal,
  });
  // sem a migração 20270127120000, só não registra
  if (error && error.code !== "PGRST202" && error.code !== "42501") {
    console.error(`Publike: não deu para registrar o contato com o candidato: ${error.message}`);
  }
  return new Response(null, { status: 204 });
}
