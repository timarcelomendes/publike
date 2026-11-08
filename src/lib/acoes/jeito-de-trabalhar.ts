"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { lerJeito } from "@/lib/jeito-de-trabalhar";
import { faltaColuna } from "@/lib/servidor/comeca-ja";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** Salva o jeito de trabalhar no currículo (migração 20270309120000). */
export async function salvarMeuJeito(escolhas: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil/curriculo" };
  const jeito = lerJeito(escolhas);
  const { data, error } = await (await criarClienteServidor())
    .from("curriculos")
    .update({ jeito })
    .eq("perfil_id", usuario.id)
    .select("perfil_id");
  if (error) {
    return {
      ok: false,
      erro: faltaColuna(error, "jeito")
        ? "Isso ainda não está disponível. Tente de novo mais tarde."
        : mensagemDeErro(error, "Não deu para salvar agora."),
    };
  }
  if (!data?.length) return { ok: false, erro: "Salve o currículo primeiro." };
  refresh();
  return { ok: true, mensagem: jeito.length ? "Salvo. As empresas veem junto do currículo." : "Salvo." };
}
