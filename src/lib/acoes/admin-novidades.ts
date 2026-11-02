"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { caminhoDoSite } from "@/lib/banners";
import { mensagemDeErro } from "@/lib/erros";
import { PARA_NOVIDADE, type ParaNovidade } from "@/lib/novidades";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Novidades: as principais evoluções do Publike, escritas uma vez (migração 20270122120000_novidades.sql).
// Publicadas, aparecem em /novidades; daqui também saem como banner e como recado no sino.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const SEM_MIGRACAO = "Rode antes a migração 20270122120000_novidades.sql no Supabase.";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

function semTabela(e: { code?: string } | null) {
  return e?.code === "42P01" || e?.code === "PGRST205";
}

/** Cria (sem `id`) ou salva uma novidade. */
export async function salvarNovidade(
  id: string | null,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (id !== null && !UUID.test(id)) return { ok: false, erro: "Novidade inválida." };

  const erros: Record<string, string> = {};
  const titulo = texto(formData, "titulo");
  const corpo = texto(formData, "texto");
  const caminho = texto(formData, "link");
  const botao = texto(formData, "botao");
  const para = texto(formData, "para") as ParaNovidade;
  const dia = texto(formData, "dia");
  if (titulo.length < 3 || titulo.length > 80) erros.titulo = "Escreva um título de 3 a 80 letras.";
  if (corpo.length < 10 || corpo.length > 400) erros.texto = "Escreva o texto, de 10 a 400 letras.";
  const link = caminho ? caminhoDoSite(caminho) : null;
  if (caminho && !link) erros.link = "Use um endereço do Publike começando com /, como /painel/links.";
  if (link && (botao.length < 2 || botao.length > 30)) erros.botao = "Escreva o texto do botão (2 a 30 letras).";
  if (!(para in PARA_NOVIDADE)) erros.para = "Escolha para quem é.";
  if (!DATA.test(dia) || Number.isNaN(Date.parse(`${dia}T12:00:00-03:00`))) erros.dia = "Escolha o dia.";
  if (Object.keys(erros).length) return { ok: false, erros };

  const dados = {
    titulo,
    texto: corpo,
    link,
    botao: link ? botao : null,
    para,
    dia,
    publicada: formData.get("publicada") === "on",
    atualizada_em: new Date().toISOString(),
  };
  const { error } = id ? await c.from("novidades").update(dados).eq("id", id) : await c.from("novidades").insert(dados);
  if (error) return { ok: false, erro: semTabela(error) ? SEM_MIGRACAO : mensagemDeErro(error) };
  // a página /novidades (no site rodando aqui; na Vercel, em até 15 minutos)
  updateTag("novidades");
  redirect(`/admin/novidades?salvo=${id ? "editada" : "nova"}`);
}

/** Publica ou tira de /novidades. */
export async function publicarNovidade(id: string, publicada: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Novidade inválida." };
  const { error } = await c
    .from("novidades")
    .update({ publicada, atualizada_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  updateTag("novidades");
  return { ok: true, mensagem: publicada ? "Publicada em Novidades." : "Saiu de Novidades." };
}

/** Apaga uma novidade (o banner e o recado que saíram dela continuam). */
export async function apagarNovidade(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Novidade inválida." };
  const { error } = await c.from("novidades").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  updateTag("novidades");
  return { ok: true, mensagem: "Novidade apagada." };
}
