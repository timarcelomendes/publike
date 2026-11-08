"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { MAX_ARQUIVOS_POR_ITEM } from "@/lib/documentos-admissao";
import { mensagemDeErro } from "@/lib/erros";
import { apagarArquivosDeDocumento } from "@/lib/servidor/documentos-admissao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Os documentos da admissão (migração 20270312120000): o candidato manda, a empresa marca a entrega ao contador.

const INDISPONIVEL = "Isso ainda não está disponível. Tente de novo mais tarde.";

async function comLogin() {
  if (MODO_DEMO) return { erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { erro: "Entre na sua conta." };
  return null;
}

function erroDe(error: { code?: string; message: string } | null, padrao: string) {
  return error?.code === "PGRST202" ? INDISPONIVEL : mensagemDeErro(error, padrao);
}

/** O candidato aceita o termo antes do primeiro documento (a empresa é a controladora; o Publike, o operador). */
export async function aceitarTermoDosDocumentos(anuncioId: string): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta.erro };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Proposta não encontrada." };
  const { error } = await (await criarClienteServidor()).rpc("aceitar_termo_documentos", { p_anuncio: anuncioId });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para continuar agora.") };
  refresh();
  return { ok: true };
}

/** O arquivo já subiu para o Storage (pelo navegador): guarda no item e apaga os de antes. */
export async function registrarDocumento(anuncioId: string, item: string, caminhos: string[]): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta.erro };
  if (!UUID.test(anuncioId) || !caminhos.length || caminhos.length > MAX_ARQUIVOS_POR_ITEM) {
    return { ok: false, erro: "Mande de 1 a 4 arquivos por item." };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("documento_registrar", {
    p_anuncio: anuncioId,
    p_item: item,
    p_caminhos: caminhos,
  });
  if (error) {
    await apagarArquivosDeDocumento(caminhos);
    return { ok: false, erro: erroDe(error, "Não deu para guardar o documento. Tente de novo.") };
  }
  await apagarArquivosDeDocumento(data ?? []);
  refresh();
  return { ok: true, mensagem: `${item}: enviado.` };
}

/** "Vou levar no primeiro dia" (ou desfazer). Apaga o arquivo que o item tinha. */
export async function vouLevarODocumento(anuncioId: string, item: string, levar: boolean): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta.erro };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Proposta não encontrada." };
  const { data, error } = await (await criarClienteServidor()).rpc("documento_vou_levar", {
    p_anuncio: anuncioId,
    p_item: item,
    p_levar: levar,
  });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para salvar agora.") };
  await apagarArquivosDeDocumento(data ?? []);
  refresh();
  return { ok: true };
}

/** A pessoa apaga todos os arquivos que mandou (antes da entrega ao contador). */
export async function apagarMeusDocumentos(anuncioId: string): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta.erro };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Proposta não encontrada." };
  const { data, error } = await (await criarClienteServidor()).rpc("documentos_apagar_meus", { p_anuncio: anuncioId });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para apagar agora.") };
  await apagarArquivosDeDocumento(data ?? []);
  refresh();
  return { ok: true, mensagem: "Pronto: os seus documentos foram apagados." };
}

/** A empresa marca que entregou ao contador: os arquivos somem em 7 dias. */
export async function marcarDocumentosEntregues(anuncioId: string, perfilId: string): Promise<Resultado> {
  const falta = await comLogin();
  if (falta) return { ok: false, erro: falta.erro };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Proposta não encontrada." };
  const { error } = await (await criarClienteServidor()).rpc("documentos_entregues", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
  });
  if (error) return { ok: false, erro: erroDe(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Pronto: marcado como entregue. Os arquivos somem do Publike em 7 dias." };
}
