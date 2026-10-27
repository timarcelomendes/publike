import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { EVENTOS_TESTE_APP, ORIGENS_TESTE_APP } from "@/lib/teste-app";

// Os números da página do teste do app (/testar-app): o navegador avisa que abriu e em que passo tocou
// (navigator.sendBeacon, que chega mesmo saindo para o Google). O banco só soma por dia, sem guardar quem.

export async function POST(request: Request) {
  if (MODO_DEMO) return new Response(null, { status: 204 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { evento, origem } = (corpo ?? {}) as { evento?: unknown; origem?: unknown };
  if (typeof evento !== "string" || !(EVENTOS_TESTE_APP as readonly string[]).includes(evento)) {
    return new Response(null, { status: 400 });
  }
  const de = typeof origem === "string" && (ORIGENS_TESTE_APP as readonly string[]).includes(origem) ? origem : "outro";
  const { error } = await criarClientePublico().rpc("contar_teste_app", { p_evento: evento, p_origem: de });
  if (error) console.error(`Publike: não deu para contar o teste do app: ${error.message}`);
  return new Response(null, { status: 204 });
}
