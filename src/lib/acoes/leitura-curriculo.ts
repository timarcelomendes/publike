"use server";

import { refresh } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Não é isso? Corrigir" (migração 20270826120000): a pessoa tira uma função indicada pela leitura do currículo. Ela
// some da busca de Talentos e não volta, nem numa leitura nova.
export async function tirarFuncaoIndicada(cbo: string): Promise<{ ok: boolean; erro?: string }> {
  if (!/^\d{6}$/.test(cbo)) return { ok: false, erro: "Função inválida." };
  const c = await criarClienteServidor();
  const { error } = await c.rpc("tirar_funcao_indicada", { p_cbo: cbo });
  if (error) return { ok: false, erro: "Não deu para tirar agora. Tente de novo." };
  refresh();
  return { ok: true };
}

// O resumo para as empresas (migração 20270901120000): a pessoa troca o automático pelo dela ou volta ao automático
// (texto vazio). Sem telefone, e-mail nem link: o banco recusa.
export async function mudarMeuResumo(texto: string | null): Promise<{ ok: boolean; erro?: string }> {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (t && (t.length < 10 || t.length > 200)) return { ok: false, erro: "O resumo vai de 10 a 200 letras." };
  const c = await criarClienteServidor();
  const { error } = await c.rpc("mudar_meu_resumo", { p_resumo: t || null });
  if (error) return { ok: false, erro: error.code === "22023" || error.code === "P0002" ? error.message : "Não deu para salvar agora. Tente de novo." };
  refresh();
  return { ok: true };
}
