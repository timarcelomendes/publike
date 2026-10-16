"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { MENSAGEM_DEMO, MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";

// Trocar o e-mail de login. O Supabase manda o link de confirmação (modelo em
// supabase/emails/trocar-email.html) e, com a troca segura ligada, um para o
// e-mail atual e outro para o novo: a troca vale quando os dois forem abertos.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VOLTA = `${SITE_URL}/auth/callback?next=${encodeURIComponent("/perfil?email=confirmado#email-login")}`;

function explicar(erro: { code?: string; message: string; status?: number }) {
  const m = erro.message.toLowerCase();
  if (erro.code === "email_exists" || m.includes("already been registered") || m.includes("already registered")) {
    return "Esse e-mail já é de outra conta no Publike.";
  }
  if (erro.code === "over_email_send_rate_limit" || erro.status === 429 || m.includes("rate limit")) {
    return "Mandamos muitos e-mails agora. Espere alguns minutos e tente de novo.";
  }
  if (erro.code === "email_address_invalid" || m.includes("invalid")) return "Confira o e-mail.";
  return "Não deu para pedir a troca agora. Tente de novo daqui a pouco.";
}

export async function trocarEmailDeLogin(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil");

  const novo = String(formData.get("novo_email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(novo) || novo.length > 200) {
    return { ok: false, erro: "Confira o e-mail.", erros: { novo_email: "Confira o e-mail." } };
  }
  if (novo === usuario.email?.toLowerCase()) {
    return { ok: false, erro: "Esse já é o seu e-mail de login.", erros: { novo_email: "Esse já é o seu e-mail." } };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ email: novo }, { emailRedirectTo: VOLTA });
  if (error) {
    const erro = explicar(error);
    return { ok: false, erro, erros: { novo_email: erro } };
  }
  refresh();
  return {
    ok: true,
    mensagem: usuario.email
      ? `Mandamos um link para ${novo} e outro para ${usuario.email}. Abra os dois para confirmar a troca.`
      : `Mandamos um link para ${novo}. Abra para confirmar.`,
  };
}

/** Manda de novo o link da troca que ainda não foi confirmada. */
export async function reenviarTrocaDeEmail(novo: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre de novo para continuar.", ir: "/entrar?next=/perfil" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resend({
    type: "email_change",
    email: novo,
    options: { emailRedirectTo: VOLTA },
  });
  if (error) return { ok: false, erro: explicar(error) };
  return { ok: true, mensagem: "Mandamos o link de novo." };
}
