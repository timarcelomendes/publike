"use server";

import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A janela flutuante das conversas do WhatsApp no Admin (19/11/2026; Marcelo: "deixa o chat aberto em uma janela
// flutuante [...] exibir somente quando acessar o admin"): a lista e a conversa aberta, lidas de tempos em tempos.
// Só quem vê Admin › WhatsApp.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
}

export type ConversaNaLista = {
  chave: string;
  nome: string | null;
  final: string;
  perfil: "trabalho" | "contratar" | null;
  situacao: "robo" | "equipe";
  ultima_em: string;
  nao_vista: boolean;
  ultima: { de: "pessoa" | "robo" | "equipe"; texto: string } | null;
};

export type ConversaNaJanela = {
  chave: string;
  nome: string | null;
  final: string;
  perfil: "trabalho" | "contratar" | null;
  situacao: "robo" | "equipe";
  janela_ate: string | null;
  conta: { id: string; nome: string | null; tipo: string } | null;
  mensagens: { de: "pessoa" | "robo" | "equipe"; texto: string; em: string }[];
};

/** A lista (as 50 mais recentes do filtro) e quantas estão com a equipe. */
export async function conversasDaJanela(
  filtro: "todas" | "equipe",
): Promise<{ lista: ConversaNaLista[]; comEquipe: number } | null> {
  const c = await banco();
  if (!c) return null;
  const { data, error } = await c.rpc("admin_whatsapp_conversas", { p_filtro: filtro });
  if (error || !data) return null;
  const d = data as unknown as { resumo: { com_a_equipe: number }; lista: ConversaNaLista[] };
  return { lista: d.lista, comEquipe: d.resumo?.com_a_equipe ?? 0 };
}

/** A conversa aberta, com as mensagens. */
export async function conversaDaJanela(chave: string): Promise<ConversaNaJanela | null> {
  const c = await banco();
  if (!c || !/^[0-9]{8,15}$/.test(chave)) return null;
  const { data, error } = await c.rpc("admin_whatsapp_conversa", { p_conversa: chave });
  if (error || !data) return null;
  return data as unknown as ConversaNaJanela;
}
