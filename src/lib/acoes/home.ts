"use server";

import { refresh, revalidatePath } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { ehFundo } from "@/lib/fundos";
import type { Resultado } from "@/lib/tipos";
import { proximaVisita } from "@/lib/linha-do-tempo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * A pessoa abriu a home: grava a hora (e, numa visita nova, leva a marca "Você parou aqui" para a
 * abertura anterior). Chamada pelo navegador depois que a página aparece: a página não grava
 * enquanto desenha. Sem a migração da home, não faz nada.
 */
export async function registrarVisitaDaHome(): Promise<void> {
  if (MODO_DEMO) return;
  const usuario = await obterUsuario();
  if (!usuario) return;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("preferencias")
    .select("home_vista_em, home_marca_em")
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  if (error) return;
  // perfil_id vem sozinho (auth.uid()); a pessoa só escreve as colunas dela
  await supabase
    .from("preferencias")
    .upsert(proximaVisita(data?.home_vista_em ?? null, data?.home_marca_em ?? null, Date.now()), {
      onConflict: "perfil_id",
    });
}

/** Guarda a aba escolhida na linha do tempo (a home abre nela da próxima vez). */
export async function escolherAbaDaHome(aba: string): Promise<void> {
  if (MODO_DEMO || !["tudo", "vaga", "servico", "recado"].includes(aba)) return;
  const usuario = await obterUsuario();
  if (!usuario) return;
  const supabase = await criarClienteServidor();
  await supabase.from("preferencias").upsert({ home_aba: aba }, { onConflict: "perfil_id" });
}

/** Escolhe uma das imagens prontas (ou o preto) para o fundo do topo; apaga a foto enviada antes. */
export async function escolherFundo(fundo: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!ehFundo(fundo) || fundo === "foto") return { ok: false, erro: "Escolha um dos fundos." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("preferencias")
    .upsert({ fundo, fundo_arquivo: null }, { onConflict: "perfil_id" });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível trocar o fundo agora.") };
  await limparFundos(supabase, usuario.pessoaId, null);
  refresh();
  return { ok: true, mensagem: "Fundo trocado." };
}

/** Guarda a foto que a pessoa enviou (já em fundos/<id>/) como fundo do topo. */
export async function salvarFotoDoFundo(caminho: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };
  if (typeof caminho !== "string" || !new RegExp(`^${usuario.pessoaId}/\\d+\\.jpg$`).test(caminho)) {
    return { ok: false, erro: "Envie a foto de novo." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("preferencias")
    .upsert({ fundo: "foto", fundo_arquivo: caminho }, { onConflict: "perfil_id" });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível guardar a foto agora.") };
  await limparFundos(supabase, usuario.pessoaId, caminho);
  refresh();
  return { ok: true, mensagem: "Foto no fundo." };
}

/** Troca a foto do perfil pelo topo da home (a foto já foi para avatars/<id>/). */
export async function trocarFotoPeloTopo(caminho: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };
  // quem age por uma agência troca a foto (o logo) no perfil da agência
  if (usuario.id !== usuario.pessoaId) return { ok: false, erro: "Troque a foto no perfil.", ir: "/perfil#foto" };
  if (typeof caminho !== "string" || !new RegExp(`^${usuario.id}/\\d+\\.jpg$`).test(caminho)) {
    return { ok: false, erro: "Envie a foto de novo." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("perfis").update({ foto: caminho }).eq("id", usuario.id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível trocar a foto agora.") };
  // as fotos antigas saem da pasta (como no perfil)
  const { data: arquivos } = await supabase.storage.from("avatars").list(usuario.id, { limit: 100 });
  const atual = caminho.split("/")[1];
  const sobras = (arquivos ?? []).filter((a) => a.name !== atual).map((a) => `${usuario.id}/${a.name}`);
  if (sobras.length) await supabase.storage.from("avatars").remove(sobras);
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Foto trocada." };
}

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Tira da pasta de fundos o que não é a foto em uso. */
async function limparFundos(supabase: Cliente, pessoaId: string, emUso: string | null) {
  const { data: arquivos } = await supabase.storage.from("fundos").list(pessoaId, { limit: 100 });
  const atual = emUso?.split("/")[1] ?? null;
  const sobras = (arquivos ?? []).filter((a) => a.name !== atual).map((a) => `${pessoaId}/${a.name}`);
  if (sobras.length) await supabase.storage.from("fundos").remove(sobras);
}
