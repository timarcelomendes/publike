import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Os números dos banners da página inicial: o navegador avisa quando o banner apareceu, quando
// tocaram no botão e quando fecharam (navigator.sendBeacon, que chega mesmo trocando de página).
// O banco só soma por dia, sem guardar quem (contar_banner). Para quem tem conta, marca também que a
// pessoa viu ou tocou no botão (marcar_banner_visto), para não mostrar de novo em outro aparelho.

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
  // quem tem conta: fica marcado na conta (vale em qualquer aparelho); sem conta, o banco ignora
  if (evento !== "fechou") {
    await (await criarClienteServidor()).rpc("marcar_banner_visto", { p_banner: id, p_clicou: evento === "clique" });
  }
  return new Response(null, { status: 204 });
}
