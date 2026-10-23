import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

/**
 * "Mandou o PDF e não salvou": o PDF do currículo vai para a pasta da pessoa assim que ela envia,
 * antes de salvar. Se o salvar falhou (o site publicado de novo com a página aberta, a internet caiu)
 * ou ela saiu antes de tocar em Salvar, o PDF fica lá e o currículo não existe. Os anexos do chat
 * ficam na mesma pasta e não contam.
 */
export type PdfNaoSalvo = { caminho: string; enviadoEm: string | null };

/** Só os dos últimos 30 dias: depois disso, a pessoa já seguiu a vida. */
const DIAS = 30;

export async function pdfNaoSalvoDe(
  cliente: Pick<SupabaseClient, "storage" | "from">,
  perfilId: string,
  /** a hora da requisição (agoraDaRequisicao) */
  agora: number,
): Promise<PdfNaoSalvo | null> {
  const [{ data: arquivos }, { data: noChat }] = await Promise.all([
    cliente.storage.from("curriculos").list(perfilId, { limit: 20, sortBy: { column: "created_at", order: "desc" } }),
    cliente.from("mensagens").select("anexo").eq("autor_id", perfilId).not("anexo", "is", null),
  ]);
  const doChat = new Set((noChat ?? []).map((m: { anexo: string | null }) => m.anexo?.split("/")[1]));
  const limite = agora - DIAS * 24 * 3600 * 1000;
  const pdf = (arquivos ?? []).find(
    (a) =>
      a.name.endsWith(".pdf") && !doChat.has(a.name) && (!a.created_at || new Date(a.created_at).getTime() >= limite),
  );
  return pdf ? { caminho: `${perfilId}/${pdf.name}`, enviadoEm: pdf.created_at ?? null } : null;
}

/** O PDF não salvo de quem entrou (só pessoa, sem currículo salvo). Uma vez por página. */
export const meuPdfNaoSalvo = cache(async (): Promise<PdfNaoSalvo | null> => {
  if (MODO_DEMO) return null;
  try {
    const usuario = await obterUsuario();
    if (!usuario) return null;
    const [perfil, curriculo] = await Promise.all([obterMeuPerfil(), obterMeuCurriculo()]);
    if (perfil?.tipo !== "pessoa" || curriculo) return null;
    return await pdfNaoSalvoDe(await criarClienteServidor(), usuario.id, await agoraDaRequisicao());
  } catch {
    return null;
  }
});
