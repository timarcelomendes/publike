"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario, perfilCompleto } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { apagarArquivosDaPessoa } from "@/lib/servidor/arquivos";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { errosPorCampo, lerPerfil } from "@/lib/validacao";

export async function salvarPerfil(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil");

  const leitura = lerPerfil(formData);
  if (!leitura.success) {
    return { ok: false, erro: "Confira os campos marcados.", erros: errosPorCampo(leitura.error) };
  }
  const d = leitura.data;

  // A foto precisa estar na pasta da própria pessoa no Storage (o banco confere de novo).
  if (d.foto && !d.foto.startsWith(`${usuario.id}/`)) {
    return { ok: false, erro: "Envie a foto de novo.", erros: { foto: "Envie a foto de novo." } };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_perfil", {
    p_nome: d.nome,
    p_tipo: d.tipo,
    p_cidade: d.cidade,
    p_bairro: d.bairro,
    p_sobre: d.sobre,
    p_servicos: d.servicos,
    p_foto: d.foto,
    p_whatsapp: d.whatsapp,
    p_email: d.email,
    p_receber_emails: d.receber_emails,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar o perfil agora.") };
  // perfil novo avisa a equipe por e-mail
  after(processarFilas);

  // Apaga fotos antigas que ficaram na pasta da pessoa
  const atual = d.foto?.split("/")[1] ?? null;
  const { data: arquivos } = await supabase.storage.from("avatars").list(usuario.id, { limit: 100 });
  const sobras = (arquivos ?? []).filter((a) => a.name !== atual).map((a) => `${usuario.id}/${a.name}`);
  if (sobras.length) await supabase.storage.from("avatars").remove(sobras);

  const proximo = formData.get("next");
  if (typeof proximo === "string" && proximo) {
    revalidatePath("/", "layout");
    redirect(caminhoSeguro(proximo, "/painel"));
  }
  refresh();
  return { ok: true, mensagem: "Perfil salvo." };
}

/** LGPD: apaga a conta e tudo o que é dela. */
export async function excluirConta(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (formData.get("confirmar") !== "on") {
    return { ok: false, erro: "Marque a caixa de confirmação para excluir a conta." };
  }
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar");

  const supabase = await criarClienteServidor();
  // Conta suspensa não se exclui (não dá para fugir da suspensão); confere
  // antes de mexer na foto.
  const { data: suspensa } = await supabase.rpc("minha_conta_suspensa");
  if (suspensa) return { ok: false, erro: "Sua conta está suspensa. Se achar que é um engano, fale com a gente." };
  if (!(await apagarArquivosDaPessoa(supabase, usuario.id))) {
    return { ok: false, erro: "Não foi possível apagar suas fotos agora. Tente de novo." };
  }
  const { error } = await supabase.rpc("excluir_minha_conta");
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível excluir agora. Tente de novo.") };

  await supabase.auth.signOut().catch(() => undefined);
  revalidatePath("/", "layout");
  redirect("/?conta=excluida");
}

export async function sair() {
  if (!MODO_DEMO) {
    const supabase = await criarClienteServidor();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

/** Depois do login por celular: completa o perfil se faltar, senão segue. */
export async function irDepoisDoLogin(proximo: string) {
  const destino = caminhoSeguro(proximo, "/");
  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(destino)}`);
  const perfil = await obterMeuPerfil();
  revalidatePath("/", "layout");
  if (!perfilCompleto(perfil)) redirect(`/perfil?completar=1&next=${encodeURIComponent(destino)}`);
  redirect(destino);
}
