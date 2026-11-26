"use server";

import { redirect } from "next/navigation";
import { MODO_DEMO } from "@/lib/config";
import { chaveSecretaSupabase } from "@/lib/servidor/ambiente";
import { acessoFila } from "@/lib/servidor/filas";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// O e-mail escrito no WhatsApp (migração 20271012120000): o link do e-mail abre /confirmar-email/<token>, e o toque em
// "Confirmar e-mail" põe o e-mail no login da conta (com a chave do Supabase), confirmado. Abrir a página não muda nada
// (o leitor de links do e-mail abre sozinho).

export type EmailAConfirmar = {
  situacao: "vale" | "usado" | "vencido" | "nao_achou";
  email?: string;
  conta?: string;
};

export async function lerEmailAConfirmar(
  token: string,
  usar = false,
): Promise<EmailAConfirmar | null> {
  const acesso = acessoFila();
  if (MODO_DEMO || !acesso || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await acesso.cliente.rpc(
    "servidor_email_a_confirmar",
    {
      p_chave: acesso.chave,
      p_token: token,
      p_usar: usar,
    },
  );
  if (error || !data) return null;
  return data as unknown as EmailAConfirmar;
}

export async function confirmarEmailDoWhatsapp(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const volta = (r: string) => redirect(`/confirmar-email/${token}?r=${r}`);
  const e = await lerEmailAConfirmar(token);
  if (!e) return volta("erro");
  if (e.situacao === "usado") return volta("ok");
  if (e.situacao !== "vale" || !e.email || !e.conta) return volta(e.situacao);
  if (!chaveSecretaSupabase()) return volta("erro");
  const { error } = await criarClienteAdmin().auth.admin.updateUserById(
    e.conta,
    { email: e.email, email_confirm: true },
  );
  if (error) {
    const m = error.message.toLowerCase();
    return volta(
      error.code === "email_exists" || m.includes("already")
        ? "de_outra"
        : "erro",
    );
  }
  await lerEmailAConfirmar(token, true);
  return volta("ok");
}
