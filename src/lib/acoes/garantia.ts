"use server";

import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** O cliente responde, pelo link, se a pessoa continua (migração 20270410120000). Sem conta. */
export async function responderGarantia(token: string, resposta: "continua" | "saiu"): Promise<Resultado> {
  if (!/^[0-9a-f]{64}$/.test(token) || !["continua", "saiu"].includes(resposta)) {
    return { ok: false, erro: "Este link não vale." };
  }
  const { data, error } = await (await criarClienteServidor()).rpc("responder_garantia", {
    p_token: token,
    p_resposta: resposta,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // o aviso no celular da agência sai já
  after(processarFilas);
  const r = (data ?? {}) as { resposta?: string; ja_respondido?: boolean };
  if (r.ja_respondido) return { ok: true, mensagem: "Esta pergunta já tinha sido respondida. Obrigado!" };
  return {
    ok: true,
    mensagem:
      r.resposta === "saiu"
        ? "Obrigado. A agência já foi avisada e vai cuidar da reposição."
        : "Obrigado. A agência já foi avisada de que está tudo certo.",
  };
}
