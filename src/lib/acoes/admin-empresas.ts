"use server";

import { refresh } from "next/cache";
import type { EmpresaDoAdmin } from "@/lib/admin/dados";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Empresas (migração 20261209120000_empresas_catalogo.sql): juntar os nomes da mesma empresa, marcar o que
// não é empresa, corrigir o nome e ligar ao perfil da empresa no Publike. Tudo fica no registro da equipe.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const SEM_MIGRACAO = "Rode a migração 20261209120000_empresas_catalogo.sql primeiro.";
const ehId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

function erroDoBanco(error: { code?: string; message: string }): Resultado {
  return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error) };
}

/** Para o "Juntar com…": as empresas com o nome parecido (até 6). */
export async function buscarEmpresasParaJuntar(
  busca: string,
  menos: number,
): Promise<
  { ok: true; itens: Pick<EmpresaDoAdmin, "id" | "nome" | "pessoas" | "perfil">[] } | { ok: false; erro: string }
> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const q = typeof busca === "string" ? busca.trim().slice(0, 80) : "";
  if (q.length < 2) return { ok: true, itens: [] };
  const { data, error } = await c.rpc("admin_empresas", { p_busca: q, p_filtro: "todas", p_limite: 7, p_pagina: 1 });
  if (error) return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error) };
  const itens = ((data as unknown as { itens: EmpresaDoAdmin[] }).itens ?? [])
    .filter((e) => e.id !== menos && e.tipo === "empresa")
    .slice(0, 6)
    .map(({ id, nome, pessoas, perfil }) => ({ id, nome, pessoas, perfil }));
  return { ok: true, itens };
}

/** A empresa "de" passa a ser a "para": os nomes, os trabalhos e a conta. */
export async function juntarEmpresas(de: number, para: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!ehId(de) || !ehId(para) || de === para) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_empresa_juntar", { p_de: de, p_para: para });
  if (error) return erroDoBanco(error);
  refresh();
  return { ok: true, mensagem: `Pronto: agora é tudo “${data}”.` };
}

/** "Não é empresa" (casa de família, autônomo…) ou de volta para empresa. */
export async function mudarTipoDaEmpresa(id: number, tipo: "empresa" | "nao_empresa"): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!ehId(id) || (tipo !== "empresa" && tipo !== "nao_empresa")) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_empresa_tipo", { p_id: id, p_tipo: tipo });
  if (error) return erroDoBanco(error);
  refresh();
  return { ok: true, mensagem: tipo === "nao_empresa" ? "Marcada como “não é empresa”." : "Voltou a ser empresa." };
}

export async function renomearEmpresa(id: number, nome: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const limpo = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  if (!ehId(id)) return { ok: false, erro: "Pedido inválido." };
  if (limpo.length < 2 || limpo.length > 80) return { ok: false, erro: "Use de 2 a 80 letras." };
  const { error } = await c.rpc("admin_empresa_nome", { p_id: id, p_nome: limpo });
  if (error) return erroDoBanco(error);
  refresh();
  return { ok: true, mensagem: `Nome salvo: “${limpo}”.` };
}

/** Ligar ao perfil (o link do perfil ou o código da conta) ou tirar a conta (vazio). */
export async function ligarEmpresaAoPerfil(id: number, perfil: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!ehId(id)) return { ok: false, erro: "Pedido inválido." };
  const texto = typeof perfil === "string" ? perfil.trim() : "";
  const perfilId = texto
    ? (texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? "")
    : null;
  if (perfilId !== null && !UUID.test(perfilId)) {
    return { ok: false, erro: "Cole o link do perfil da empresa (publike.org/perfil/…) ou o código da conta." };
  }
  const { data, error } = await c.rpc("admin_empresa_ligar_perfil", { p_id: id, p_perfil: perfilId });
  if (error) return erroDoBanco(error);
  refresh();
  return { ok: true, mensagem: data ? `Ligada à conta “${data}”.` : "A empresa ficou sem conta ligada." };
}

/** "São diferentes": o par sai das possíveis repetidas. */
export async function marcarEmpresasDiferentes(a: number, b: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!ehId(a) || !ehId(b) || a === b) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_empresas_diferentes", { p_a: a, p_b: b });
  if (error) return erroDoBanco(error);
  refresh();
  return { ok: true };
}
