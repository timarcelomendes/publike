"use server";

import { refresh } from "next/cache";
import type { EmpresaDoAdmin } from "@/lib/admin/dados";
import { mensagemDeErro } from "@/lib/erros";
import { agruparEmpresasComIA } from "@/lib/ia/empresas";
import { ErroIA, iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Empresas (migração 20261209120000_empresas_catalogo.sql): juntar os nomes da mesma empresa, marcar o que
// não é empresa, corrigir o nome e ligar ao perfil da empresa no Publike. Tudo fica no registro da equipe.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const SEM_MIGRACAO = "Rode a migração 20261209120000_empresas_catalogo.sql primeiro.";
const SEM_MIGRACAO_CONTAS = "Rode a migração 20261210120000_empresas_contas.sql primeiro.";
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

/** A conta de empresa sem ligar não é a empresa dos currículos: sai de "Contas para ligar". */
export async function dispensarContaDaEmpresa(perfil: string, empresa: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(perfil) || !ehId(empresa)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_empresa_conta_dispensar", { p_perfil: perfil, p_empresa: empresa });
  if (error) {
    return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO_CONTAS : mensagemDeErro(error) };
  }
  refresh();
  return { ok: true };
}

/** Junta várias na que fica (o grupo que a IA sugeriu). */
export async function juntarVariasEmpresas(para: number, de: number[]): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const lista = Array.isArray(de) ? [...new Set(de)].filter((n) => ehId(n) && n !== para).slice(0, 20) : [];
  if (!ehId(para) || !lista.length) return { ok: false, erro: "Pedido inválido." };
  let nome = "";
  for (const id of lista) {
    const { data, error } = await c.rpc("admin_empresa_juntar", { p_de: id, p_para: para });
    if (error) {
      refresh();
      return erroDoBanco(error);
    }
    nome = data;
  }
  refresh();
  return { ok: true, mensagem: `Pronto: agora é tudo “${nome}”.` };
}

export type SugestaoDaIA = {
  ids: number[];
  motivo: string;
  empresas: { id: number; nome: string; pessoas: number; com_conta: boolean }[];
};

/** A IA olha os nomes das empresas mais citadas e sugere as que são a mesma. Só sugere. */
export async function sugerirRepetidasComIA(): Promise<
  { ok: true; grupos: SugestaoDaIA[] } | { ok: false; erro: string }
> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!iaConfigurada()) {
    return { ok: false, erro: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
  const [{ data, error }, { data: config }] = await Promise.all([
    c.rpc("admin_empresas_para_ia", { p_limite: 200 }),
    c.rpc("admin_config"),
  ]);
  if (error) return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO_CONTAS : mensagemDeErro(error) };
  const empresas = (data ?? []).map((e) => ({ ...e, pessoas: Number(e.pessoas) }));
  if (empresas.length < 2) return { ok: true, grupos: [] };
  try {
    const grupos = await agruparEmpresasComIA(empresas, modeloDaIA(config?.[0]?.ia_modelo).id);
    const porId = new Map(empresas.map((e) => [e.id, e]));
    return {
      ok: true,
      grupos: grupos.map((g) => ({ ...g, empresas: g.ids.map((id) => porId.get(id)!).filter(Boolean) })),
    };
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu olhar as empresas agora." };
  }
}

/** "Não são a mesma" no grupo da IA: cada par sai das sugestões (as de nomes parecidos também). */
export async function marcarGrupoDiferente(ids: number[]): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const lista = Array.isArray(ids) ? [...new Set(ids)].filter(ehId).slice(0, 10) : [];
  if (lista.length < 2) return { ok: false, erro: "Pedido inválido." };
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const { error } = await c.rpc("admin_empresas_diferentes", { p_a: lista[i], p_b: lista[j] });
      if (error) return erroDoBanco(error);
    }
  }
  refresh();
  return { ok: true };
}
