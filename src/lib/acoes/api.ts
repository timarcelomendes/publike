"use server";

import { refresh } from "next/cache";
import { CAMINHO_CHAVES } from "@/lib/api-publica";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// As chaves da API pública (Configurações › API; migração 20270713120000_api_publica.sql). O banco confere quem pode
// (o dono da conta ou um admin da equipe, numa conta que contrata) e guarda só o sha256 da chave.

const AINDA_NAO = "A API ainda não está no ar. Tente de novo em alguns minutos.";

/** Cria uma chave e devolve ela inteira: a única vez que ela aparece. */
export async function criarChaveApi(nome: string): Promise<Resultado & { chave?: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=${encodeURIComponent(CAMINHO_CHAVES)}` };
  const texto = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  if (!texto || texto.length > 60) {
    return { ok: false, erro: "Dê um nome à chave, com até 60 letras, como “CRM da agência”." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("criar_chave_api", { p_nome: texto });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: AINDA_NAO };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para criar a chave agora. Tente de novo.") };
  }
  refresh();
  return { ok: true, chave: data };
}

/** Apaga a chave: o sistema que usa ela para de entrar na hora. */
export async function apagarChaveApi(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, erro: "Chave não encontrada." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=${encodeURIComponent(CAMINHO_CHAVES)}` };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("apagar_chave_api", { p_id: id });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: AINDA_NAO };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para apagar a chave agora. Tente de novo.") };
  }
  refresh();
  return { ok: true, mensagem: "Chave apagada. O sistema que usava ela não entra mais." };
}
