"use server";

import { refresh, revalidatePath } from "next/cache";
import { after } from "next/server";
import { CENTRO_GOIANIA, MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { criarLocal, pontoDoLocal } from "@/lib/regioes";
import { centroDoBairro } from "@/lib/servidor/cep";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { lerRecado, UUID } from "@/lib/validacao";

/** O meio do bairro do perfil (nunca a casa). Sem o mapa em 3 segundos, o centro da região ou da cidade. */
async function lugarDoRecado(cidade: string, bairro: string | null) {
  const semMapa = new Promise<null>((resolver) => setTimeout(() => resolver(null), 3000));
  const centro = bairro ? await Promise.race([centroDoBairro(bairro, cidade).catch(() => null), semMapa]) : null;
  const local = criarLocal(cidade, bairro ?? "", "perfil", { centro });
  return local ? { ...pontoDoLocal(local), cidade: local.cidade, bairro: local.bairro || null } : null;
}

export type ResultadoRecado = Resultado & { emRevisao?: boolean };

/** Escreve um recado (texto, foto já enviada para recados/<pessoa>/ e, se quiser, a vaga citada). */
export async function escreverRecado(formData: FormData): Promise<ResultadoRecado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para escrever um recado.", ir: "/entrar?next=/" };
  const leitura = lerRecado(formData);
  if (!leitura.success) return { ok: false, erro: leitura.error.issues[0]?.message ?? "Confira o recado." };
  const d = leitura.data;
  if (d.foto && !d.foto.startsWith(`${usuario.pessoaId}/`)) return { ok: false, erro: "Envie a foto de novo." };

  const perfil = await obterMeuPerfil();
  if (!perfil) return { ok: false, erro: "Complete seu perfil antes de escrever um recado.", ir: "/perfil" };
  const lugar = await lugarDoRecado(perfil.cidade, perfil.bairro);
  if (!lugar) return { ok: false, erro: "Complete a cidade e o bairro no seu perfil.", ir: "/perfil" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .rpc("escrever_recado", {
      p_texto: d.texto,
      p_foto: d.foto,
      p_anuncio: d.anuncio_id,
      p_lat: lugar.lat,
      p_lng: lugar.lng,
      p_cidade: lugar.cidade,
      p_bairro: lugar.bairro,
    })
    .maybeSingle();
  if (error) {
    if (precisaCompletarPerfil(error)) return { ok: false, erro: mensagemDeErro(error), ir: "/perfil" };
    return { ok: false, erro: mensagemDeErro(error, "Não foi possível publicar o recado agora.") };
  }
  const emRevisao = data?.status === "revisao";
  if (emRevisao) after(processarFilas);
  refresh();
  return {
    ok: true,
    emRevisao,
    mensagem: emRevisao ? "Recado enviado. Ele aparece para os outros depois da revisão." : "Recado publicado.",
  };
}

/** Apaga o próprio recado (some de todo lugar) e a foto dele. */
export async function apagarRecado(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Recado não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/" };
  const supabase = await criarClienteServidor();
  const { data: foto, error } = await supabase.rpc("apagar_recado", { p_recado: id });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível apagar agora.") };
  if (foto) await supabase.storage.from("recados").remove([foto]);
  revalidatePath(`/recado/${id}`);
  refresh();
  return { ok: true, mensagem: "Recado apagado." };
}

/** Dá (ou tira) a Força de um recado. */
export async function darForca(id: string): Promise<{ ok: true; forcas: number; dei: boolean } | Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Recado não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para dar Força.", ir: "/entrar?next=/" };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("dar_forca", { p_recado: id }).maybeSingle();
  if (error || !data) return { ok: false, erro: mensagemDeErro(error, "Não foi possível agora. Tente de novo.") };
  return { ok: true, forcas: data.forcas, dei: data.dei };
}

const MOTIVOS: readonly string[] = MOTIVOS_DENUNCIA.map((m) => m.valor);

/** Denuncia um recado (os mesmos motivos da denúncia de anúncio). */
export async function denunciarRecado(id: string, motivo: string, detalhes: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Recado não encontrado." };
  if (!MOTIVOS.includes(motivo)) return { ok: false, erro: "Escolha o motivo." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para denunciar.", ir: "/entrar?next=/" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("denunciar_recado", {
    p_recado: id,
    p_motivo: motivo,
    p_detalhes: detalhes.trim().slice(0, 1000) || null,
  });
  if (error) {
    if (error.hint === "repetida") return { ok: true, mensagem: error.message };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Denúncia enviada. Obrigado por cuidar da comunidade." };
}

export type Citavel = { id: string; tipo: string; titulo: string; autor: string; bairro: string | null };

/** "Citar vaga": as vagas e serviços no ar com a palavra no título (Goiânia e região). */
export async function procurarParaCitar(texto: string): Promise<Citavel[]> {
  if (MODO_DEMO) return [];
  const termo = String(texto ?? "")
    .trim()
    .slice(0, 60);
  if (termo.length < 2) return [];
  const usuario = await obterUsuario();
  if (!usuario) return [];
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("buscar_anuncios", {
    p_lat: CENTRO_GOIANIA.lat,
    p_lng: CENTRO_GOIANIA.lng,
    p_raio_km: 100,
    p_texto: termo,
    p_ordem: "recentes",
    p_limite: 8,
  });
  return (data ?? []).map((a) => ({ id: a.id, tipo: a.tipo, titulo: a.titulo, autor: a.autor_nome, bairro: a.bairro }));
}

/** Moderação: liberar (vai ao ar) ou remover (com o motivo para quem escreveu). */
export async function moderarRecado(id: string, decisao: "liberar" | "remover", nota?: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["liberar", "remover"].includes(decisao)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe();
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };
  const { error } = await acesso.cliente.rpc("moderar_recado", {
    p_recado: id,
    p_decisao: decisao,
    p_nota: (nota ?? "").trim().slice(0, 500) || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: decisao === "remover" ? "Recado removido. Quem escreveu recebe o aviso." : "Pronto: recado no ar.",
  };
}
