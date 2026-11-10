"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm } from "@/lib/tipos";

// As ações do Painel do admin (claude/plano-indicadores-do-admin.md).

const FORA = "O admin só abre no seu computador.";

/** O gasto com anúncios de um mês e canal (Painel › Dinheiro). Zero apaga. Migração 20270402120000. */
export async function salvarGastoDivulgacao(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const mes = String(formData.get("mes") ?? "");
  const canal = String(formData.get("canal") ?? "").trim();
  const valor = Number(
    String(formData.get("valor") ?? "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, erro: "Escolha o mês." };
  if (canal.length < 2 || canal.length > 40) return { ok: false, erro: "Escreva o canal (de 2 a 40 letras)." };
  if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) return { ok: false, erro: "Confira o valor." };
  const { error } = await c.rpc("admin_salvar_gasto", { p_mes: `${mes}-01`, p_canal: canal, p_valor: valor });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270402120000_dinheiro_do_admin.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: valor ? "Gasto salvo." : "Gasto apagado." };
}

const CHAVES_DE_META = ["encontros", "vagas_novas", "vagas_3_48h", "de_novo", "ativos"];

/** A meta de um indicador da Visão geral (vazio tira). Migração 20270403120000. */
export async function salvarMeta(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const indicador = String(formData.get("indicador") ?? "");
  const bruto = String(formData.get("valor") ?? "").trim();
  if (!CHAVES_DE_META.includes(indicador)) return { ok: false, erro: "Pedido inválido." };
  const valor = bruto === "" ? null : Number(bruto.replace(",", "."));
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0 || valor > 100_000)) {
    return { ok: false, erro: "Confira o valor da meta." };
  }
  const { error } = await c.rpc("admin_salvar_meta", { p_indicador: indicador, p_valor: valor });
  if (error) {
    if (error.code === "PGRST202") {
      return { ok: false, erro: "Rode a migração 20270403120000_metas_e_numeros_da_semana.sql primeiro." };
    }
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: valor === null ? "Meta tirada." : "Meta salva." };
}

/** Liga ou desliga os números da semana por e-mail (segunda, 8h, para quem recebe os avisos da equipe). */
export async function ligarNumerosDaSemana(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const ligado = formData.get("ligado") === "sim";
  const { error } = await c.rpc("admin_ligar_numeros_semana", { p_ligado: ligado });
  if (error) {
    if (error.code === "PGRST202") {
      return { ok: false, erro: "Rode a migração 20270403120000_metas_e_numeros_da_semana.sql primeiro." };
    }
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: ligado ? "Ligado: sai na próxima segunda, às 8h." : "Desligado." };
}

/**
 * Edita uma linha do gasto com anúncios (Painel › Dinheiro): o valor e o nome do canal. Com o canal trocado, grava o
 * novo e apaga o antigo. Valor zero remove.
 */
export async function editarGastoDivulgacao(dados: {
  mes: string;
  canalAntigo: string;
  canal: string;
  valor: number;
}): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const canal = dados.canal.trim();
  if (!/^\d{4}-\d{2}-01$/.test(dados.mes)) return { ok: false, erro: "Pedido inválido." };
  if (canal.length < 2 || canal.length > 40) return { ok: false, erro: "Escreva o canal (de 2 a 40 letras)." };
  if (!Number.isFinite(dados.valor) || dados.valor < 0 || dados.valor > 1_000_000) {
    return { ok: false, erro: "Confira o valor." };
  }
  const { error } = await c.rpc("admin_salvar_gasto", { p_mes: dados.mes, p_canal: canal, p_valor: dados.valor });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (dados.canalAntigo !== canal && dados.valor > 0) {
    const { error: e2 } = await c.rpc("admin_salvar_gasto", {
      p_mes: dados.mes,
      p_canal: dados.canalAntigo,
      p_valor: 0,
    });
    if (e2) return { ok: false, erro: mensagemDeErro(e2) };
  }
  refresh();
  return { ok: true, mensagem: dados.valor ? "Gasto salvo." : "Gasto removido." };
}
