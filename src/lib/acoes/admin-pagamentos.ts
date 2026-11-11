"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Pagamentos (migração 20261218120000): os preços, abrir para todos, as contas de teste e a nota.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

function falha(error: { code?: string; message: string }): Resultado {
  if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20261218120000_pagamentos.sql primeiro." };
  return { ok: false, erro: mensagemDeErro(error) };
}

/** O preço e se está à venda. `valor` em reais ("49,90"); vazio: sem preço. */
/** Os 3 meses e o anual vão sempre em reais inteiros, sem centavos (pedido do Marcelo, 11/11/2026). */
const SEM_CENTAVOS = new Set(["QUARTERLY", "YEARLY"]);

export async function salvarPlano(id: string, valor: string, ligado: boolean, ciclo?: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const limpo = valor
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const numero = !limpo
    ? null
    : ciclo && SEM_CENTAVOS.has(ciclo)
      ? Math.round(Number(limpo))
      : Math.round(Number(limpo) * 100) / 100;
  if (numero != null && (!Number.isFinite(numero) || numero < 5 || numero > 100000))
    return { ok: false, erro: "Ponha um preço entre R$ 5 e R$ 100.000." };
  const { error } = await c.rpc("admin_salvar_plano", { p_id: id, p_valor: numero, p_ligado: ligado });
  if (error) return falha(error);
  refresh();
  return { ok: true, mensagem: ligado ? "Salvo: o plano está à venda." : "Salvo: o plano não está à venda." };
}

export async function salvarConfigPagamentos(d: {
  aberto: boolean;
  servico: string;
  eCodigo: boolean;
  descricao: string;
}): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_config_pagamentos", {
    p_aberto: d.aberto,
    p_servico: d.servico.slice(0, 60),
    p_e_codigo: d.eCodigo,
    p_descricao: d.descricao.slice(0, 250),
  });
  if (error) return falha(error);
  refresh();
  return { ok: true, mensagem: d.aberto ? "Salvo: todas as contas já podem assinar." : "Salvo." };
}

/**
 * A conta que testa os pagamentos antes de abrir para todos (pelo código da conta, que vem da busca, ou pelo
 * e-mail de login). `sandbox`: com o site em produção, paga na conta sandbox do Asaas (nada é cobrado).
 */
export async function contaDeTestePagamentos(conta: string, marcar: boolean, sandbox?: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const valor = conta.trim();
  if (!valor) return { ok: false, erro: "Escreva o e-mail de login ou o código da conta." };
  const { error } = await c.rpc("admin_pagamentos_teste", { p_conta: valor, p_marcar: marcar });
  if (error) return falha(error);
  if (marcar && sandbox !== undefined && UUID.test(valor)) {
    const { error: e2 } = await c.rpc("admin_pagamentos_teste_sandbox", { p_conta: valor, p_sandbox: sandbox });
    if (e2) return falhaSandbox(e2);
  }
  refresh();
  if (!marcar) return { ok: true, mensagem: "Conta tirada do teste." };
  return {
    ok: true,
    mensagem: sandbox
      ? "Pronto: essa conta já vê o Assinar e paga no sandbox (nada é cobrado)."
      : "Pronto: essa conta já vê o Assinar.",
  };
}

function falhaSandbox(error: { code?: string; message: string }): Resultado {
  if (error.code === "PGRST202")
    return { ok: false, erro: "Rode a migração 20270125120000_pagamentos_sandbox.sql primeiro." };
  return { ok: false, erro: mensagemDeErro(error) };
}

/** A conta de teste paga no sandbox do Asaas (true) ou na produção, de verdade (false). */
export async function sandboxDaContaDeTeste(conta: string, sandbox: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(conta)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_pagamentos_teste_sandbox", { p_conta: conta, p_sandbox: sandbox === true });
  if (error) return falhaSandbox(error);
  refresh();
  return {
    ok: true,
    mensagem: sandbox ? "Agora paga no sandbox (nada é cobrado)." : "Agora paga na produção: a cobrança é de verdade.",
  };
}

export type ContaAchada = { id: string; nome: string; tipo: string; contato: string | null };

const PODE_ASSINAR = new Set(["comercio", "empresa", "agencia"]);

/** As contas que podem assinar (comércio, empresa ou agência) pelo nome, celular ou e-mail, para pôr no teste. */
export async function procurarContasParaTeste(
  texto: string,
): Promise<{ ok: true; contas: ContaAchada[] } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const busca = texto.trim().slice(0, 80);
  if (busca.length < 2) return { ok: false, erro: "Escreva o nome, o celular ou o e-mail (2 letras ou mais)." };
  const { data, error } = await c.rpc("admin_listar_usuarios", {
    p_busca: busca,
    p_filtro: "todos",
    p_limite: 40,
    p_deslocamento: 0,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const contas = (data ?? [])
    .filter((u) => u.tipo && PODE_ASSINAR.has(u.tipo))
    .slice(0, 8)
    .map((u) => ({
      id: u.id,
      nome: u.nome ?? "Sem nome",
      tipo: u.tipo as string,
      contato: u.email || u.telefone || null,
    }));
  return { ok: true, contas };
}
