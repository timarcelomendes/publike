"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { lerListaDeTestadores } from "@/lib/testadores-app";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Testadores do app (migração 20270128120000): pôr a lista, marcar o convite mandado e tirar alguém.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

function falha(error: { code?: string; message: string }): Resultado {
  if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270128120000_testadores_app.sql primeiro." };
  return { ok: false, erro: mensagemDeErro(error) };
}

export async function salvarTestadores(texto: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { lista, erros } = lerListaDeTestadores(String(texto ?? "").slice(0, 20000));
  if (!lista.length) return { ok: false, erro: erros[0] ?? "Cole pelo menos uma pessoa: nome, e-mail e WhatsApp." };
  const { data, error } = await c.rpc("admin_salvar_testadores_app", { p_lista: lista });
  if (error) return falha(error);
  refresh();
  const n = Number(data ?? lista.length);
  return {
    ok: true,
    mensagem: `${n} ${n === 1 ? "pessoa salva" : "pessoas salvas"}.${erros.length ? ` Atenção: ${erros.join(" ")}` : ""}`,
  };
}

/** O admin tocou em mandar: guarda a hora (o envio é ele quem faz, no WhatsApp ou no e-mail). */
export async function marcarConviteTestador(id: string, canal: "whatsapp" | "email"): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || (canal !== "whatsapp" && canal !== "email")) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_marcar_convite_testador", { p_id: id, p_canal: canal });
  if (error) return falha(error);
  refresh();
  return { ok: true };
}

export async function apagarTestador(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_apagar_testador", { p_id: id });
  if (error) return falha(error);
  refresh();
  return { ok: true, mensagem: "Tirado da lista." };
}
