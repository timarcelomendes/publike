"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerDenuncia, registroDoAnuncio, UUID } from "@/lib/validacao";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { gravarVaga } from "@/lib/servidor/comeca-ja";
import { LIMITE_CONVERSA_MODERACAO } from "@/lib/conversa-moderacao";

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
  after(processarFilas);
  return { ok: true, mensagem: "Denúncia enviada. Obrigado por cuidar da comunidade." };
}

/** Admin (no computador dele) ou moderador: remover (com motivo para quem publicou) ou liberar. */
export async function moderarAnuncio(id: string, decisao: "remover" | "liberar", nota?: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["remover", "liberar"].includes(decisao)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe(["/admin/denuncias", "/admin/anuncios"]);
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };

  const motivo = (nota ?? "").trim().slice(0, 500) || null;
  const { error } = await acesso.cliente.rpc("moderar_anuncio", { p_anuncio: id, p_decisao: decisao, p_nota: motivo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  after(processarFilas);
  revalidatePath("/");
  refresh();
  return {
    ok: true,
    mensagem: decisao === "remover" ? "Anúncio removido. Quem publicou recebe o aviso." : "Pronto: anúncio no ar e denúncias fechadas.",
  };
}

/** Correção de um anúncio pela moderação (o tipo e o autor não mudam). */
export async function salvarAnuncioDaEquipe(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
  const acesso = await acessoDaEquipe(["/admin/denuncias", "/admin/anuncios"]);
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso." };

  // a moderação corrige o anúncio de outra pessoa: o link de qualquer site vale (o banco só confere o link que muda)
  const leitura = lerAnuncio(formData, { equipe: true });
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const { data, error } = await gravarVaga(registroDoAnuncio(d), (r) =>
    acesso.cliente.from("anuncios").update(r).eq("id", id).select("id"),
  );
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Anúncio não encontrado." };
  await salvarTriagem(acesso.cliente, id, d.triagem);

  revalidatePath("/");
  redirect(`/admin/anuncios/${id}?salvo=1`);
}

/** Conversa com a moderação (migração 20270405120000): quem publicou explica o anúncio em análise ou removido. */
export async function explicarParaModeracao(anuncioId: string, texto: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Escreva a explicação." };
  if (limpo.length > LIMITE_CONVERSA_MODERACAO) return { ok: false, erro: `Use até ${LIMITE_CONVERSA_MODERACAO} letras.` };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/anuncio/${anuncioId}` };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("explicar_para_moderacao", { p_anuncio: anuncioId, p_texto: limpo });
  if (error?.code === "PGRST202") return { ok: false, erro: "A conversa com a moderação ainda não está pronta. Tente mais tarde." };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Enviado. A moderação lê antes de decidir, e você recebe um aviso quando ela responder." };
}

/** A moderação pergunta a quem publicou (chega no sino, no celular e no e-mail). */
export async function perguntarAoAnunciante(anuncioId: string, texto: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const limpo = texto.trim();
  if (limpo.length < 3) return { ok: false, erro: "Escreva a pergunta." };
  if (limpo.length > LIMITE_CONVERSA_MODERACAO) return { ok: false, erro: `Use até ${LIMITE_CONVERSA_MODERACAO} letras.` };
  const acesso = await acessoDaEquipe(["/admin/denuncias", "/admin/anuncios"]);
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const { error } = await acesso.cliente.rpc("perguntar_ao_anunciante", { p_anuncio: anuncioId, p_texto: limpo });
  if (error?.code === "PGRST202")
    return { ok: false, erro: "Rode antes a migração 20270405120000_conversa_da_moderacao.sql." };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pergunta enviada para o sino e o e-mail de quem publicou." };
}

/** As horas que a moderação pode escolher para a remoção agendada (14/11/2026, Marcelo: "em 7h, 3h e 24h"). */
const HORAS_DA_REMOCAO = [3, 7, 24];

/**
 * Agenda a saída do ar (migração 20270525120000). Quem publicou recebe o aviso na conversa da moderação (sino, celular
 * e e-mail), com a hora; na hora marcada, o robô remove como o botão Remover.
 */
export async function agendarRemocao(
  anuncioId: string,
  horas: number,
  nota: string,
  soSemResposta: boolean,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !HORAS_DA_REMOCAO.includes(horas)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe(["/admin/denuncias", "/admin/anuncios"]);
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const motivo = nota.trim().slice(0, 500) || null;
  const { data, error } = await acesso.cliente.rpc("agendar_remocao", {
    p_anuncio: anuncioId,
    p_horas: horas,
    p_nota: motivo,
    p_so_sem_resposta: soSemResposta,
  });
  if (error?.code === "PGRST202") return { ok: false, erro: "Rode antes a migração 20270525120000_remocao_agendada.sql." };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(String((data as { remover_em?: string } | null)?.remover_em ?? Date.now())));
  const aviso = soSemResposta
    ? `Olá! Aqui é da equipe do Publike. Este anúncio sai do ar em ${quando} se os candidatos continuarem sem resposta. Para ele continuar no ar, responda cada pessoa em Painel › Candidatos (Chamar para entrevista ou Não seguir).`
    : `Olá! Aqui é da equipe do Publike. Este anúncio sai do ar em ${quando}.${motivo ? ` Motivo: ${motivo}` : ""}`;
  const { error: e2 } = await acesso.cliente.rpc("perguntar_ao_anunciante", { p_anuncio: anuncioId, p_texto: aviso });
  if (e2) console.error("Publike: a remoção foi agendada, mas o aviso não saiu:", e2.message);
  after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem: e2
      ? `Agendada para ${quando}. O aviso para quem publicou não saiu; mande pela conversa.`
      : `Agendada para ${quando}. Quem publicou recebeu o aviso.`,
  };
}

/** Desfaz a remoção agendada. */
export async function cancelarRemocao(anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe(["/admin/denuncias", "/admin/anuncios"]);
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const { error } = await acesso.cliente.rpc("cancelar_remocao", { p_anuncio: anuncioId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Remoção cancelada." };
}
