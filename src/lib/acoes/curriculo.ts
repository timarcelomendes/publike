"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { limparCurriculos } from "@/lib/servidor/arquivos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { lerCurriculo } from "@/lib/validacao";

/**
 * Salva o currículo. Só a própria pessoa e quem anunciou uma vaga que ela
 * curtiu conseguem ver (o banco garante). O PDF já foi enviado pelo navegador
 * para a pasta privada da pessoa; os antigos saem do Storage.
 */
export async function salvarCurriculo(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil/curriculo");

  const leitura = lerCurriculo(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  if (d.arquivo && !d.arquivo.startsWith(`${usuario.id}/`)) return { ok: false, erro: "Envie o PDF de novo." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("curriculos").upsert(
    {
      perfil_id: usuario.id,
      escolaridade: d.escolaridade,
      curso: d.curso,
      experiencias: d.experiencias,
      cursos: d.cursos,
      cnh: d.cnh,
      disponibilidade: d.disponibilidade,
      arquivo: d.arquivo,
    },
    { onConflict: "perfil_id" },
  );
  if (error) {
    if (precisaCompletarPerfil(error)) redirect("/perfil?completar=1&next=/perfil/curriculo");
    return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar seu currículo agora.") };
  }
  await limparCurriculos(supabase, usuario.id, d.arquivo);

  revalidatePath("/perfil/curriculo");
  const proximo = caminhoSeguro(formData.get("next"), "");
  redirect(proximo || "/perfil/curriculo?salvo=1");
}

/** Apaga o currículo inteiro (e o PDF). */
export async function apagarCurriculo(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (formData.get("confirmar") !== "on") return { ok: false, erro: "Marque a caixa para confirmar." };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil/curriculo");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("curriculos").delete().eq("perfil_id", usuario.id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível apagar seu currículo agora.") };
  await limparCurriculos(supabase, usuario.id, null);
  revalidatePath("/perfil/curriculo");
  redirect("/perfil/curriculo?apagado=1");
}
