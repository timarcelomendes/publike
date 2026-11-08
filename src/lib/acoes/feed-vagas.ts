"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { faltaColuna } from "@/lib/servidor/comeca-ja";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** Liga ou desliga as vagas da conta no arquivo para outros sites de vagas (migração 20270310120000). */
export async function mudarVagasEmOutrosSites(ligar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const { error } = await (await criarClienteServidor())
    .from("perfis")
    .update({ vagas_em_outros_sites: ligar })
    .eq("id", usuario.id);
  if (error) {
    return {
      ok: false,
      erro: faltaColuna(error, "vagas_em_outros_sites")
        ? "Isso ainda não está disponível. Tente de novo mais tarde."
        : mensagemDeErro(error, "Não deu para salvar agora."),
    };
  }
  refresh();
  return {
    ok: true,
    mensagem: ligar
      ? "Pronto: as suas vagas vão também para outros sites de vagas."
      : "Pronto: as suas vagas ficam só no Publike e no Google.",
  };
}
