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
import { lerAnuncio, UUID } from "@/lib/validacao";

/** Erro do banco no formulário: o da empresa contratante fica marcado no campo. */
function erroDoBanco(error: { code?: string; message?: string; hint?: string | null }): EstadoForm {
  const erro = mensagemDeErro(error);
  if (error.hint === "contratante") return { ok: false, erro: "Confira os campos marcados.", erros: { contratante: erro } };
  return { ok: false, erro };
}

/** Publica um anúncio novo ou salva a edição de um existente. */
export async function salvarAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/publicar");

  const leitura = lerAnuncio(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const registro = {
    titulo: d.titulo,
    descricao: d.descricao,
    categoria: d.categoria,
    regime: d.regime,
    pagamento_valor: d.pagamento_valor,
    pagamento_unidade: d.pagamento_unidade,
    beneficios: d.beneficios,
    horario: d.horario,
    vagas: d.vagas,
    pede_curriculo: d.pede_curriculo,
    contratante: d.contratante,
    contratante_confidencial: d.contratante_confidencial,
    cidade: d.cidade,
    bairro: d.bairro,
    cep: d.endereco ? d.cep : null,
    endereco: d.endereco,
    local: `SRID=4326;POINT(${d.lng} ${d.lat})`,
  };

  const supabase = await criarClienteServidor();
  const id = formData.get("id");
  let destino: string;

  if (typeof id === "string" && id) {
    if (!UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
    const { data, error } = await supabase.from("anuncios").update(registro).eq("id", id).select("id");
    if (error) return erroDoBanco(error);
    if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };
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
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel" };

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
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel" };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("renovar_anuncio", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  refresh();
  return { ok: true, mensagem: "Pronto: mais 30 dias no ar." };
}

export async function excluirAnuncio(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };

  revalidatePath("/");
  redirect("/painel?excluido=1");
}
