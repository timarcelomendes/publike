"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CENTRO_GOIANIA, MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { REGIMES } from "@/lib/constantes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { lerAnuncio, registroDoAnuncio, UUID } from "@/lib/validacao";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { categoriaPeloTitulo, descricaoSimples } from "@/lib/modelos-anuncio";
import { centroDoBairro } from "@/lib/servidor/cep";
import { lerHorario, textoDoHorario } from "@/lib/vaga-extra";
import type { Regime } from "@/lib/tipos";

/**
 * Publicar sem travar: só o título, o tipo de contratação, o valor e o bairro são
 * obrigatórios. Sem categoria, vale a do título; sem descrição, uma simples com o que
 * foi preenchido; sem ponto no mapa, o meio do bairro (`provisorio`: só para conferir
 * o formulário antes de entrar, sem consultar o mapa).
 */
async function completarAnuncio(formData: FormData, provisorio = false) {
  const texto = (nome: string) => {
    const v = formData.get(nome);
    return typeof v === "string" ? v.trim() : "";
  };
  const titulo = texto("titulo");
  if (!texto("categoria") && titulo) formData.set("categoria", categoriaPeloTitulo(titulo));
  if (!texto("descricao") && titulo.length >= 2 && texto("bairro")) {
    const regime = texto("regime");
    const horario = lerHorario(texto("horario_detalhe") || null);
    formData.set(
      "descricao",
      descricaoSimples({
        titulo,
        regime: regime || null,
        nomeRegime: REGIMES[regime as Regime]?.nome ?? null,
        horario: horario.ok && horario.horario ? textoDoHorario(horario.horario) : texto("horario") || null,
        bairro: texto("bairro"),
        cidade: texto("cidade") || "Goiânia",
      }),
    );
  }
  if ((!texto("lat") || !texto("lng")) && texto("bairro")) {
    const centro = provisorio
      ? CENTRO_GOIANIA
      : await centroDoBairro(texto("bairro"), texto("cidade") || "Goiânia").catch(() => null);
    if (centro) {
      formData.set("lat", String(centro.lat));
      formData.set("lng", String(centro.lng));
    }
  }
}

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

/** Erro do banco no formulário: o da empresa contratante e o da faixa salarial ficam marcados no campo. */
function erroDoBanco(error: { code?: string; message?: string; hint?: string | null }): EstadoForm {
  const erro = mensagemDeErro(error);
  if (error.hint === "contratante" || error.hint === "pagamento_ate") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
  }
  return { ok: false, erro };
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
  const registro = registroDoAnuncio(d);

  const supabase = await criarClienteServidor();
  const id = formData.get("id");
  let destino: string;

  if (typeof id === "string" && id) {
    if (!UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
    const { data, error } = await supabase.from("anuncios").update(registro).eq("id", id).select("id");
    if (error) return erroDoBanco(error);
    if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };
    await salvarTriagem(supabase, id, d.triagem);
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
  return { ok: true, mensagem: "Pronto: mais 30 dias no ar." };
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
