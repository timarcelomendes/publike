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
export async function salvarPlano(id: string, valor: string, ligado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const limpo = valor
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const numero = limpo ? Math.round(Number(limpo) * 100) / 100 : null;
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

/** A conta que testa os pagamentos antes de abrir para todos (pelo e-mail de login ou o código da conta). */
export async function contaDeTestePagamentos(conta: string, marcar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const valor = conta.trim();
  if (!valor) return { ok: false, erro: "Escreva o e-mail de login ou o código da conta." };
  const { error } = await c.rpc("admin_pagamentos_teste", { p_conta: valor, p_marcar: marcar });
  if (error) return falha(error);
  refresh();
  return { ok: true, mensagem: marcar ? "Pronto: essa conta já vê o Assinar." : "Conta tirada do teste." };
}
