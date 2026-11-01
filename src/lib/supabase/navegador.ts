import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "./tipos-banco";
import { COOKIES_DA_SESSAO, SUPABASE_CHAVE, SUPABASE_URL } from "@/lib/config";

/** Cliente do Supabase para componentes que rodam no navegador. */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { cookieOptions: COOKIES_DA_SESSAO });
}

/**
 * Abre um canal ao vivo (Realtime) já com o login. Sem esperar o token, o canal entrava como visitante, o Realtime
 * recusava o filtro ("invalid column for filter destinatario_id", dezenas de vezes por dia) e o aviso novo só
 * aparecia ao recarregar a página. `montar` cria o canal com os `.on(...)`; aqui ele é assinado. Devolve o fechar.
 */
export function ouvirAoVivo(
  supabase: ReturnType<typeof criarClienteNavegador>,
  montar: (s: ReturnType<typeof criarClienteNavegador>) => RealtimeChannel,
): () => void {
  let canal: RealtimeChannel | null = null;
  let fechado = false;
  supabase.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (!fechado) canal = montar(supabase).subscribe();
    });
  return () => {
    fechado = true;
    if (canal) void supabase.removeChannel(canal);
  };
}
