import "server-only";
import { cache } from "react";
import { lerConviteEquipe, TOKEN_EQUIPE, type ContaDisponivel, type PapelEquipe } from "@/lib/equipe";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Equipe da agência: as contas pelas quais a pessoa pode agir, a equipe da conta atual, os
// convites esperando resposta e o que cada um fez.

/** O banco ainda sem a migração da equipe: a função ou a tabela não existe. */
function semMigracao(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01";
}

/** A conta da pessoa e as das equipes de que ela faz parte (só uma: ninguém para trocar). */
export const minhasContas = cache(async (): Promise<ContaDisponivel[]> => {
  const { data } = await (await criarClienteServidor()).rpc("minhas_contas");
  return (data ?? []).map((c) => ({
    conta_id: c.conta_id,
    nome: c.nome,
    foto: c.foto,
    tipo: c.tipo,
    papel: c.papel === "admin" || c.papel === "recrutador" ? c.papel : "dono",
    atual: c.atual === true,
  }));
});

export type MembroDaEquipe = {
  membro_id: string;
  nome: string;
  foto: string | null;
  papel: PapelEquipe;
  desde: string;
  ultima_atividade: string | null;
  sou_eu: boolean;
};

/** Quem está na equipe da conta atual (null: o banco ainda não tem a equipe). */
export async function equipeDaConta(): Promise<MembroDaEquipe[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("equipe_da_conta");
  if (error && semMigracao(error)) return null;
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, papel: m.papel === "admin" ? "admin" : "recrutador" }));
}

export type ConviteDaEquipe = {
  id: string;
  token: string;
  nome: string | null;
  papel: PapelEquipe;
  criado_em: string;
  expira_em: string;
};

/** Os convites esperando resposta (o banco só mostra para quem administra; null: ainda sem a equipe). */
export async function convitesDaEquipe(contaId: string, agora: number): Promise<ConviteDaEquipe[] | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("convites_equipe")
    .select("id, token, nome, papel, criado_em, expira_em")
    .eq("agencia_id", contaId)
    .is("aceito_em", null)
    .is("cancelado_em", null)
    .gt("expira_em", new Date(agora).toISOString())
    .order("criado_em", { ascending: false });
  if (error && semMigracao(error)) return null;
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, papel: c.papel === "admin" ? "admin" : "recrutador" }));
}

export type AtividadeDaEquipe = {
  id: number;
  criado_em: string;
  membro_id: string | null;
  quem: string;
  texto: string;
  anuncio_id: string | null;
  perfil_id: string | null;
};

/** O que a equipe fez, do mais novo para o mais antigo (null: o banco ainda não tem a equipe). */
export async function atividadesDaEquipe(limite = 60): Promise<AtividadeDaEquipe[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("atividades_da_equipe", { p_limite: limite });
  if (error && semMigracao(error)) return null;
  if (error) throw error;
  return data ?? [];
}

/** O convite do link, com o login de quem abriu. */
export async function conviteEquipeDoToken(token: string) {
  if (!TOKEN_EQUIPE.test(token)) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("convite_equipe_do_token", { p_token: token });
  if (error) throw error;
  return lerConviteEquipe(data);
}
