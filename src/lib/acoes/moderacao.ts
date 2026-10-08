"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerDenuncia, UUID } from "@/lib/validacao";

export async function denunciarAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const leitura = lerDenuncia(formData);
  if (!leitura.success) {
    return { ok: false, erro: "Escolha o motivo da denúncia.", erros: errosPorCampo(leitura.error) };
  }
  const d = leitura.data;
  if (!UUID.test(d.anuncio_id)) return { ok: false, erro: "Anúncio não encontrado." };

  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(`/anuncio/${d.anuncio_id}/denunciar`)}`);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("denuncias")
    .insert({ anuncio_id: d.anuncio_id, motivo: d.motivo, detalhes: d.detalhes });
  if (error) {
    if (error.code === "23505") {
      return { ok: true, mensagem: "Você já tinha denunciado este anúncio. A moderação vai analisar." };
    }
    if (error.code === "42501") return { ok: false, erro: "Não dá para denunciar este anúncio (ele é seu?)." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  return { ok: true, mensagem: "Denúncia enviada. Obrigado por cuidar da comunidade." };
}

export async function moderarAnuncio(id: string, decisao: "remover" | "liberar"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["remover", "liberar"].includes(decisao)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/moderacao" };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("moderar_anuncio", { p_anuncio: id, p_decisao: decisao });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  revalidatePath("/");
  refresh();
  return { ok: true, mensagem: decisao === "remover" ? "Anúncio removido." : "Anúncio liberado." };
}
