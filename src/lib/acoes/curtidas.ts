"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { lerDesfazerMatch, temContato, UUID } from "@/lib/validacao";

/** Curtir = "tenho interesse". */
export async function curtirAnuncio(anuncioId: string, mensagem: string | null = null): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const voltar = `/anuncio/${anuncioId}`;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre para curtir.", ir: `/entrar?next=${encodeURIComponent(voltar)}` };

  const texto = (mensagem ?? "").trim().slice(0, 280) || null;
  if (temContato(texto)) {
    return { ok: false, erro: "Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("curtidas").insert({ anuncio_id: anuncioId, mensagem: texto });
  if (error) {
    if (precisaCompletarPerfil(error) || error.code === "23503") {
      return {
        ok: false,
        erro: "Complete seu perfil com um WhatsApp para curtir.",
        ir: `/perfil?completar=1&next=${encodeURIComponent(voltar)}`,
      };
    }
    if (error.code === "23505") {
      refresh();
      return { ok: true };
    }
    if (error.code === "42501") return { ok: false, erro: "Este anúncio não pode ser curtido (é seu ou já saiu do ar)." };
    return { ok: false, erro: mensagemDeErro(error) };
  }

  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Curtido! Se quem publicou curtir você de volta, o contato aparece no seu painel." };
}

/** Desfaz a curtida enquanto ainda não houve resposta. */
export async function descurtirAnuncio(anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curtidas")
    .delete()
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", usuario.id)
    .select("anuncio_id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Essa curtida já teve resposta e não pode ser desfeita." };

  refresh();
  return { ok: true };
}

/** Quem publicou responde: dar match, dispensar ou desfazer a resposta. */
export async function responderCurtida(
  anuncioId: string,
  perfilId: string,
  decisao: "match" | "dispensada" | "pendente",
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId) || !["match", "dispensada", "pendente"].includes(decisao)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel" };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_curtida", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_decisao: decisao,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  if (decisao === "match") after(processarFilas);
  refresh();
  if (decisao === "match") return { ok: true, mensagem: "Deu match! Agora é só conversar." };
  return { ok: true };
}

/**
 * Um dos lados desiste do match. Precisa de motivo e justificativa: a outra
 * pessoa vê o motivo; a justificativa fica só para a equipe. O contato some
 * para os dois na hora.
 */
export async function desfazerMatch(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const leitura = lerDesfazerMatch(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para continuar." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("desfazer_match", {
    p_anuncio: d.anuncio,
    p_perfil: d.perfil,
    p_motivo: d.motivo,
    p_justificativa: d.justificativa,
  });
  if (error) {
    const campo = error.hint === "motivo" || error.hint === "justificativa" ? error.hint : null;
    const erro = mensagemDeErro(error, "Não foi possível desfazer o match agora.");
    return campo ? { ok: false, erro, erros: { [campo]: erro } } : { ok: false, erro };
  }

  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Match desfeito. O contato não aparece mais para nenhum dos dois." };
}
