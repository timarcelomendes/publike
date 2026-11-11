"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// O convite automático (migração 20270418120000): ligar por vaga, com o recado; e, para quem procura, não receber.

export async function ligarConviteAutomatico(anuncio: string, ligado: boolean, recado: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncio)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode mudar isso." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("ligar_convite_automatico", {
    p_anuncio: anuncio,
    p_ligado: ligado === true,
    p_recado: String(recado ?? "").slice(0, 300) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: ligado ? "Convite automático ligado nesta vaga." : "Convite automático desligado." };
}

export async function receberConvitesAutomaticos(sim: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("receber_convites_automaticos", { p_sim: sim === true });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: sim ? "Pronto: você volta a receber." : "Pronto: as empresas não convidam você automaticamente." };
}
