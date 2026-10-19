"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { lerAnuncio, registroDoAnuncio, UUID, type DadosAnuncio } from "@/lib/validacao";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { completarAnuncio } from "@/lib/servidor/completar-anuncio";

/**
 * Antes de entrar: confere o anúncio de quem ainda não tem conta (nada é salvo). Com
 * tudo certo, a página guarda o rascunho no aparelho e leva para entrar; depois de
 * entrar, ele é publicado.
 */
export async function conferirAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await completarAnuncio(formData, true);
  const leitura = lerAnuncio(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  return { ok: true };
}

/** Erro do banco no formulário: o da empresa contratante, do cliente e da faixa salarial ficam marcados no campo. */
function erroDoBanco(error: { code?: string; message?: string; hint?: string | null }): EstadoForm {
  const erro = mensagemDeErro(error);
  if (error.hint === "contratante" || error.hint === "pagamento_ate") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
  }
  if (error.hint === "cliente") return { ok: false, erro: "Confira os campos marcados.", erros: { cliente_id: erro } };
  return { ok: false, erro };
}

type Banco = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Agência: a empresa escrita à mão vira cliente (ou acha o cliente com o mesmo nome). Falhou: a vaga sai sem. */
async function garantirCliente(supabase: Banco, nome: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("garantir_cliente", { p_nome: nome });
  if (error) console.warn(`Publike: não deu para guardar o cliente: ${error.message}`);
  return data ?? null;
}

/**
 * Depois de salvar a vaga de um cliente: o cliente sem lugar guarda o da vaga (a próxima já vem
 * com ele) e, numa vaga nova, o cliente arquivado volta para a lista.
 */
async function cuidarDoCliente(supabase: Banco, clienteId: string, d: DadosAnuncio, nova: boolean) {
  const mudancas = [
    supabase
      .from("clientes_agencia")
      .update({
        cidade: d.cidade,
        bairro: d.bairro,
        cep: d.endereco ? d.cep : null,
        endereco: d.endereco,
        lat: d.lat,
        lng: d.lng,
      })
      .eq("id", clienteId)
      .is("bairro", null)
      .is("lat", null),
  ];
  if (nova) {
    mudancas.push(
      supabase
        .from("clientes_agencia")
        .update({ arquivado_em: null })
        .eq("id", clienteId)
        .not("arquivado_em", "is", null),
    );
  }
  for (const { error } of await Promise.all(mudancas)) {
    if (error) console.warn(`Publike: não deu para atualizar o cliente: ${error.message}`);
  }
}

/** Publica um anúncio novo ou salva a edição de um existente. */
export async function salvarAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/publicar");

  await completarAnuncio(formData);
  const leitura = lerAnuncio(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const supabase = await criarClienteServidor();
  const clienteNovo = d.cliente_novo ? await garantirCliente(supabase, d.cliente_novo) : null;
  const registro = { ...registroDoAnuncio(d), ...(clienteNovo ? { cliente_id: clienteNovo } : {}) };
  const cliente = clienteNovo ?? d.cliente_id ?? null;

  const id = formData.get("id");
  let destino: string;

  if (typeof id === "string" && id) {
    if (!UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
    const { data, error } = await supabase.from("anuncios").update(registro).eq("id", id).select("id");
    if (error) return erroDoBanco(error);
    if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };
    await salvarTriagem(supabase, id, d.triagem);
    if (cliente) await cuidarDoCliente(supabase, cliente, d, false);
    destino = `/anuncio/${id}?salvo=1`;
  } else {
    const { data, error } = await supabase
      .from("anuncios")
      .insert({ ...registro, tipo: d.tipo })
      .select("id")
      .single();
    if (error) {
      if (precisaCompletarPerfil(error)) redirect("/perfil?completar=1&next=/publicar");
      return erroDoBanco(error);
    }
    await salvarTriagem(supabase, data.id, d.triagem);
    if (cliente) await cuidarDoCliente(supabase, cliente, d, true);
    // veio do link do convite: publicar é o aceite (o convite vira "Autorizou" no admin)
    const convite = formData.get("convite");
    if (typeof convite === "string" && /^[0-9a-f]{64}$/.test(convite)) {
      const { error: erroConvite } = await supabase.rpc("aceitar_convite", { p_token: convite, p_anuncio: data.id });
      if (erroConvite) console.warn("Publike: não deu para registrar o aceite do convite:", erroConvite.message);
    }
    destino = `/anuncio/${data.id}?publicado=1`;
  }

  // com a moderação automática ligada, a IA revisa o texto logo depois
  after(processarFilas);
  revalidatePath("/");
  redirect(destino);
}

export async function mudarStatusAnuncio(id: string, status: "ativo" | "pausado" | "encerrado"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["ativo", "pausado", "encerrado"].includes(status)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").update({ status }).eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };

  refresh();
  const mensagens = { ativo: "Anúncio de volta no ar.", pausado: "Anúncio pausado.", encerrado: "Anúncio encerrado." };
  return { ok: true, mensagem: mensagens[status] };
}

export async function renovarAnuncio(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("renovar_anuncio", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  refresh();
  return { ok: true, mensagem: "Pronto: o prazo da vaga começou de novo." };
}

/**
 * A vaga foi preenchida (ou reaberta). Ela continua no site com a marcação, ninguém mais curte,
 * e quem curtiu e esperava (ou deu match) recebe o aviso, menos quem foi contratado.
 */
export async function marcarVagaPreenchida(id: string, preenchida: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("marcar_vaga_preenchida", { p_id: id, p_preenchida: preenchida });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para marcar agora. Tente de novo.") };

  after(processarFilas);
  refresh();
  if (!preenchida) return { ok: true, mensagem: "Vaga reaberta: dá para curtir de novo." };
  const n = data ?? 0;
  return {
    ok: true,
    mensagem:
      n === 0
        ? "Vaga marcada como preenchida."
        : `Vaga marcada como preenchida. ${n === 1 ? "1 pessoa foi avisada" : `${n} pessoas foram avisadas`}.`,
  };
}

export async function excluirAnuncio(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };

  revalidatePath("/");
  redirect("/painel/anuncios?excluido=1");
}
