"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { problemaDoRetorno } from "@/lib/retorno";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** Liga, desliga ou muda o texto do retorno a quem não seguiu (vale para todas as vagas da conta). */
export async function salvarRetorno(ligado: boolean, texto: string | null): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (t) {
    const problema = problemaDoRetorno(t);
    if (problema) return { ok: false, erro: problema };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_retorno", { p_ligado: Boolean(ligado), p_texto: t || null });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: ligado ? "Retorno salvo." : "Retorno desligado." };
}
