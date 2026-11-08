"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// As buscas salvas de Talentos (migração 20270308120000): salvar, ligar o aviso da semana e apagar.

const SEM_MIGRACAO = "As buscas salvas ainda não estão disponíveis. Tente de novo mais tarde.";

export async function salvarBuscaDeTalentos(
  nome: string,
  texto: string | null,
  cidade: string | null,
  avisar: boolean,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/talentos" };
  const { error } = await (await criarClienteServidor()).rpc("salvar_busca_talentos", {
    p_nome: nome.slice(0, 60),
    p_texto: texto?.slice(0, 120) || null,
    p_cidade: cidade?.slice(0, 60) || null,
    p_avisar: avisar,
  });
  if (error) return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return {
    ok: true,
    mensagem: avisar ? "Busca salva. Toda semana chega o aviso dos talentos novos." : "Busca salva.",
  };
}

export async function avisoDaBuscaDeTalentos(id: string, avisar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Busca não encontrada." };
  const { data, error } = await (await criarClienteServidor())
    .from("buscas_talentos")
    .update({ avisar })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: avisar ? "Aviso da semana ligado." : "Aviso desligado." };
}

export async function apagarBuscaDeTalentos(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Busca não encontrada." };
  const { error } = await (await criarClienteServidor()).from("buscas_talentos").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para apagar agora.") };
  refresh();
  return { ok: true, mensagem: "Busca apagada." };
}
