"use server";

import { refresh, revalidatePath, updateTag } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { atualizarConteudos } from "@/lib/servidor/conteudos-ia";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";

// Admin › Conteúdos (migração 20270705120000): publicar ou descartar a versão com os números atualizados que a IA
// escreveu, e conferir agora (sem esperar a rodada do dia).

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

export async function decidirConteudo(id: number, publicar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const { data: slug, error } = await c.rpc("admin_decidir_conteudo", { p_id: id, p_publicar: publicar });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  // o site mostra a versão nova (no computador, na hora; no site no ar, em alguns minutos)
  updateTag("conteudos");
  revalidatePath("/conteudos", "layout");
  if (slug) revalidatePath(`/conteudos/${slug}`);
  revalidatePath("/");
  refresh();
  return { ok: true, mensagem: publicar ? "Publicado: o artigo já mostra os números novos." : "Descartado." };
}

export async function conferirConteudosAgora(): Promise<Resultado> {
  if (!(await clienteAdminOuNulo())) return { ok: false, erro: FORA };
  const r = await atualizarConteudos();
  refresh();
  if (!r.ok) return { ok: false, erro: r.erro };
  if (!r.conferidos.length) return { ok: true, mensagem: "Nenhum artigo para conferir agora (todos conferidos nos últimos 7 dias)." };
  const novos = r.conferidos.filter((x) => x.rascunho).length;
  return {
    ok: true,
    mensagem: `${r.conferidos.length === 1 ? "1 artigo conferido" : `${r.conferidos.length} artigos conferidos`}; ${
      novos ? `${novos === 1 ? "1 versão nova" : `${novos} versões novas`} para revisar` : "nenhum número novo"
    }.`,
  };
}
