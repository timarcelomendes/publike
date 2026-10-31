"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// O aceite do WhatsApp (migração 20261231120000; claude/plano-retorno-e-whatsapp.md, parte 3a): os avisos pelo
// WhatsApp oficial começam quando a conta da Meta for liberada; quem aceita agora já recebe quando começar.

export type MeuWhatsapp = { aceito: boolean; numero: string | null; pode: boolean };

/** O aceite da conta (null: sem a migração ou sem conta). */
export async function meuWhatsapp(): Promise<MeuWhatsapp | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("whatsapp_da_conta");
  if (error) return null;
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    aceito: o.aceito === true,
    numero: typeof o.numero === "string" ? o.numero : null,
    pode: o.pode !== false,
  };
}

export async function mudarWhatsapp(aceito: boolean, origem: "avisos" | "curtir" | "quadro"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!["avisos", "curtir", "quadro"].includes(origem)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_whatsapp", { p_aceito: Boolean(aceito), p_origem: origem });
  if (error) {
    if (error.hint === "sem_numero")
      return { ok: false, erro: "Ponha o seu WhatsApp no perfil primeiro.", ir: "/perfil" };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  }
  return { ok: true };
}
