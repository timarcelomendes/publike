"use server";

import { redirect } from "next/navigation";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";

// O link de acesso que o admin mandou pelo WhatsApp (/acesso/<token>): a empresa coloca o e-mail,
// ele vira o login da conta e ela segue para entrar com ele (o Publike entra só pelo e-mail).

const MOTIVOS: Record<string, string> = {
  invalido: "Este link de acesso não vale. Peça um novo para quem mandou.",
  usado: "Este link já foi usado. Entre com o e-mail que você colocou.",
  expirado: "Este link venceu. Peça um novo para quem mandou.",
  email_invalido: "Confira o e-mail.",
  email_em_uso: "Esse e-mail já é de outra conta no Publike. Use outro e-mail.",
  ja_tem_email: "Esta conta já entra por um e-mail. Entre com ele.",
};

export async function vincularEmailDoAcesso(
  token: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, erro: MOTIVOS.invalido };
  const email = String(formData.get("email_empresa") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return { ok: false, erro: "Confira os campos marcados.", erros: { email_empresa: MOTIVOS.email_invalido } };
  }
  const { data, error } = await criarClientePublico().rpc("vincular_email_do_link", { p_token: token, p_email: email });
  if (error) return { ok: false, erro: "Não deu para ligar o e-mail agora. Tente de novo." };
  if (data !== "ok") {
    const msg = MOTIVOS[data] ?? MOTIVOS.invalido;
    return data === "email_invalido" || data === "email_em_uso"
      ? { ok: false, erro: "Confira os campos marcados.", erros: { email_empresa: msg } }
      : { ok: false, erro: msg };
  }
  // pronto: segue para entrar com o e-mail (o link de entrar chega nele)
  redirect(`/entrar?email=${encodeURIComponent(email)}&acesso=1&next=${encodeURIComponent("/painel")}`);
}
