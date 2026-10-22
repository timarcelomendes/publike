import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Os números dos banners da página inicial: o navegador avisa quando o banner apareceu, quando
// tocaram no botão e quando fecharam (navigator.sendBeacon, que chega mesmo trocando de página).
// O banco só soma por dia, sem guardar quem (contar_banner).

const EVENTOS = new Set(["visto", "clique", "fechou"]);

export async function POST(request: Request) {
  if (MODO_DEMO) return new Response(null, { status: 204 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { id, evento } = (corpo ?? {}) as { id?: unknown; evento?: unknown };
  if (typeof id !== "string" || !UUID.test(id) || typeof evento !== "string" || !EVENTOS.has(evento)) {
    return new Response(null, { status: 400 });
  }
  const { error } = await criarClientePublico().rpc("contar_banner", { p_banner: id, p_evento: evento });
  if (error) console.error(`Publike: não deu para contar o banner: ${error.message}`);
  return new Response(null, { status: 204 });
}
