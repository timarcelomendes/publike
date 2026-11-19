"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { ehMotivo, type MotivoDaEmpresa } from "@/lib/manter-contato";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Convites › Manter contato: marcar que falou com a empresa (ao abrir o WhatsApp) e o motivo que ela deu.

const FORA = "Só o admin.";
const SEM_MIGRACAO = "Rode a migração 20270810120000_convites_manter_contato no Supabase.";

/** Abriu a mensagem no WhatsApp: a empresa sai da lista por 30 dias. */
export async function marcarContato(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").update({ contato_em: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, erro: /contato_em/.test(error.message) ? SEM_MIGRACAO : mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/** O motivo que a empresa respondeu (null: apaga). */
export async function anotarMotivo(id: string, motivo: MotivoDaEmpresa | null): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || (motivo !== null && !ehMotivo(motivo))) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").update({ contato_motivo: motivo }).eq("id", id);
  if (error) return { ok: false, erro: /contato_motivo/.test(error.message) ? SEM_MIGRACAO : mensagemDeErro(error) };
  refresh();
  return { ok: true };
}
