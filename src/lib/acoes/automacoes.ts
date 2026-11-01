"use server";

import { refresh } from "next/cache";
import { ETAPAS_COM_MENSAGEM, type EtapaComMensagem } from "@/lib/automacoes";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// As automações da vaga (migração 20270109120000).

export async function salvarAutomacoes(
  anuncioId: string,
  regras: {
    dispensarEliminados: boolean;
    mensagens: Partial<Record<EtapaComMensagem, string>>;
    paradoDias: number | null;
  },
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const mensagens: Record<string, string> = {};
  for (const k of Object.keys(ETAPAS_COM_MENSAGEM) as EtapaComMensagem[]) {
    const id = regras?.mensagens?.[k];
    if (id && UUID.test(id)) mensagens[k] = id;
  }
  const dias = regras?.paradoDias == null ? null : Math.round(Number(regras.paradoDias));
  if (dias !== null && !(dias >= 2 && dias <= 30)) return { ok: false, erro: "O lembrete vai de 2 a 30 dias." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_automacoes", {
    p_anuncio: anuncioId,
    p_dispensar: regras?.dispensarEliminados === true,
    p_mensagens: mensagens,
    p_parado_dias: dias,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar as automações.") };
  refresh();
  return { ok: true, mensagem: "Automações salvas." };
}
