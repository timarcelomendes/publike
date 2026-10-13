"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { RELACOES_RECOMENDACAO } from "@/lib/constantes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { chaveBairro } from "@/lib/regioes";
import { temContatoNoTexto, UUID } from "@/lib/validacao";

// Social a serviço do emprego: seguir, recomendar e mostrar contratações.
// O banco confere tudo de novo (funções security definer com limites).

async function precisaEntrar(voltar: string): Promise<Resultado | null> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) {
    return { ok: false, erro: "Entre na sua conta para continuar.", ir: `/entrar?next=${encodeURIComponent(voltar)}` };
  }
  return null;
}

/** Resultado de seguir: o id serve para deixar de seguir sem recarregar a página. */
type ResultadoSeguir = Resultado & { id?: number };

/** Seguir um comércio, empresa, agência ou profissional: aviso quando publicar. */
export async function seguirPerfil(perfilId: string, voltar: string): Promise<ResultadoSeguir> {
  const barrado = await precisaEntrar(voltar);
  if (barrado) return barrado;
  if (!UUID.test(perfilId)) return { ok: false, erro: "Perfil não encontrado." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("seguir_perfil", { p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para seguir agora.") };
  // a tabela só mostra o que eu sigo (RLS)
  const { data } = await supabase.from("seguindo").select("id").eq("alvo_perfil", perfilId).maybeSingle();
  revalidatePath(`/perfil/${perfilId}`);
  // sem aviso: o botão vira "Seguindo ..." e a frase embaixo explica
  return { ok: true, id: data?.id };
}

/** Seguir um bairro: aviso de vaga ou serviço novo ali. */
export async function seguirBairro(cidade: string, bairro: string, voltar: string): Promise<ResultadoSeguir> {
  const barrado = await precisaEntrar(voltar);
  if (barrado) return barrado;
  const c = cidade.trim().slice(0, 80);
  const b = bairro.trim().slice(0, 80);
  if (!c || !b) return { ok: false, erro: "Escolha um bairro." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("seguir_bairro", { p_cidade: c, p_bairro: b });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para seguir agora.") };
  const { data } = await supabase
    .from("seguindo")
    .select("id")
    .is("alvo_perfil", null)
    .eq("cidade", c)
    .eq("bairro_chave", chaveBairro(b))
    .maybeSingle();
  return { ok: true, id: data?.id };
}

/** Deixar de seguir (um perfil ou um bairro). */
export async function deixarDeSeguir(id: number, voltar: string): Promise<Resultado> {
  const barrado = await precisaEntrar(voltar);
  if (barrado) return barrado;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("seguindo").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para deixar de seguir agora.") };
  revalidatePath("/painel/seguindo");
  // sem aviso: o próprio botão volta para "Seguir ..."
  return { ok: true };
}

/** Recomendar quem presta serviço (ou mudar a recomendação que já fez). */
export async function recomendarProfissional(
  profissionalId: string,
  relacao: string,
  texto: string,
): Promise<Resultado> {
  const barrado = await precisaEntrar(`/perfil/${profissionalId}#recomendacoes`);
  if (barrado) return barrado;
  if (!UUID.test(profissionalId)) return { ok: false, erro: "Perfil não encontrado." };
  if (!(relacao in RELACOES_RECOMENDACAO)) return { ok: false, erro: "Diga de onde vocês se conhecem." };
  const t = texto.trim();
  if (t.length < 10 || t.length > 300) return { ok: false, erro: "Escreva de 10 a 300 letras." };
  if (temContatoNoTexto(t)) return { ok: false, erro: "Tire o telefone, e-mail ou link da recomendação." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("recomendar", { p_profissional: profissionalId, p_relacao: relacao, p_texto: t });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar a recomendação agora.") };
  after(processarFilas);
  revalidatePath(`/perfil/${profissionalId}`);
  return { ok: true, mensagem: "Obrigado! Sua recomendação já aparece no perfil." };
}

/** Quem escreveu apaga a própria recomendação. */
export async function apagarRecomendacao(id: number, profissionalId: string): Promise<Resultado> {
  const barrado = await precisaEntrar(`/perfil/${profissionalId}`);
  if (barrado) return barrado;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("recomendacoes").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para apagar agora.") };
  revalidatePath(`/perfil/${profissionalId}`);
  return { ok: true, mensagem: "Recomendação apagada." };
}

/** Quem foi recomendado esconde ou mostra de novo no perfil. */
export async function mostrarRecomendacao(id: number, mostrar: boolean, profissionalId: string): Promise<Resultado> {
  const barrado = await precisaEntrar(`/perfil/${profissionalId}`);
  if (barrado) return barrado;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mostrar_recomendacao", { p_id: id, p_mostrar: mostrar });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para mudar agora.") };
  revalidatePath(`/perfil/${profissionalId}`);
  return { ok: true, mensagem: mostrar ? "A recomendação aparece no seu perfil." : "A recomendação ficou escondida." };
}

/** Um lado da contratação diz se topa mostrar no Publike (só aparece com o sim dos dois). */
export async function autorizarContratacao(anuncioId: string, perfilId: string, sim: boolean): Promise<Resultado> {
  const barrado = await precisaEntrar("/painel");
  if (barrado) return barrado;
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("autorizar_contratacao_publica", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_sim: sim,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  after(processarFilas);
  revalidatePath("/");
  return { ok: true };
}
