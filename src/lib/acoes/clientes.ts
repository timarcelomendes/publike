"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerCliente, UUID } from "@/lib/validacao";

// Os clientes da agência: cadastrar, editar, arquivar e excluir (painel, "Clientes").

/** Erro do banco no formulário do cliente: nome repetido, nome com contato e CNPJ ficam no campo. */
function erroDoCliente(error: { code?: string; message?: string; hint?: string | null }): EstadoForm {
  if (error.code === "23505") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { nome: "Você já tem um cliente com esse nome." } };
  }
  const erro = mensagemDeErro(error);
  if (error.hint === "nome" || error.hint === "cnpj") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
  }
  return { ok: false, erro };
}

/** Cadastra um cliente novo ou salva a edição. Depois, abre a ficha do cliente (ou publica uma vaga para ele). */
export async function salvarCliente(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/painel/clientes");

  const leitura = lerCliente(formData);
  if (!leitura.success) {
    return { ok: false, erro: "Confira os campos marcados.", erros: errosPorCampo(leitura.error) };
  }
  const d = leitura.data;
  const supabase = await criarClienteServidor();
  const id = formData.get("id");
  let clienteId: string;

  if (typeof id === "string" && id) {
    if (!UUID.test(id)) return { ok: false, erro: "Cliente não encontrado." };
    const { data, error } = await supabase.from("clientes_agencia").update(d).eq("id", id).select("id");
    if (error) return erroDoCliente(error);
    if (!data?.length) return { ok: false, erro: "Não encontramos esse cliente entre os seus." };
    clienteId = id;
    // o nome novo vai para as vagas do cliente
    revalidatePath("/");
  } else {
    const { data, error } = await supabase.from("clientes_agencia").insert(d).select("id").single();
    if (error) return erroDoCliente(error);
    clienteId = data.id;
  }

  if (formData.get("depois") === "publicar") redirect(`/publicar?cliente=${clienteId}`);
  redirect(`/painel/clientes/${clienteId}?salvo=1`);
}

/** Arquiva (some da lista ao publicar) ou traz de volta. As vagas continuam ligadas ao cliente. */
export async function arquivarCliente(id: string, arquivar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/clientes" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("clientes_agencia")
    .update({ arquivado_em: arquivar ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse cliente entre os seus." };

  refresh();
  return {
    ok: true,
    mensagem: arquivar
      ? "Cliente arquivado. Ele sai da lista ao publicar; as vagas dele continuam como estão."
      : "Cliente de volta na lista.",
  };
}

/** Exclui o cliente que não tem vaga (com vaga, o caminho é arquivar: a vaga guarda de quem é). */
export async function excluirCliente(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/clientes" };

  const supabase = await criarClienteServidor();
  const { count, error: erroContagem } = await supabase
    .from("anuncios")
    .select("id", { count: "exact", head: true })
    .eq("autor_id", usuario.id)
    .eq("cliente_id", id);
  if (erroContagem) return { ok: false, erro: mensagemDeErro(erroContagem) };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: "Este cliente tem vagas. Arquive em vez de excluir: as vagas continuam sabendo de quem são.",
    };
  }
  const { data, error } = await supabase.from("clientes_agencia").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse cliente entre os seus." };

  redirect("/painel/clientes?excluido=1");
}
