"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { obterUsuario } from "@/lib/dados";
import { COOKIE_INTENCAO, lerIntencao } from "@/lib/intencao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/**
 * Guarda o que a pessoa quer fazer no Publike. Logada: na conta (vale em qualquer
 * aparelho). Sem login: só nesta visita (o cookie some quando o navegador fecha,
 * e a pergunta volta na próxima vez).
 */
export async function salvarIntencao(valor: string): Promise<Resultado> {
  const intencao = lerIntencao(valor);
  if (!intencao) return { ok: false, erro: "Escolha uma das opções." };
  const usuario = await obterUsuario();
  if (usuario) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("salvar_intencao", { p_intencao: intencao });
    if (error) console.error(`Publike: falha ao guardar a intenção: ${error.message}`);
  }
  (await cookies()).set(COOKIE_INTENCAO, intencao, {
    ...(usuario ? { maxAge: 365 * 24 * 3600 } : {}),
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  refresh();
  return { ok: true };
}
