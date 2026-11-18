import "server-only";
import nodemailer from "nodemailer";
import { SITE_URL } from "@/lib/config";
import { emailValido } from "@/lib/email-valido";
import { linkDeSairUmToque, montarEmailEmpresas } from "@/lib/email-empresas";
import { acessoFila } from "./filas";
import { textoDoErro } from "./falhas";

// O e-mail às empresas (18/11/2026; migração 20270722120000). Sai pela caixa do Marcelo (o Zoho Mail), não pelo
// serviço dos avisos do site: o ZeptoMail só aceita e-mail transacional, e um bloqueio por prospecção pararia também os
// links de entrar e os avisos. Um por vez, quando o banco diz que é a hora (dia útil, no horário, abaixo do limite do
// dia e espaçado). Sem as variáveis CAMPANHA_SMTP_*, nada sai.

type ConfigCampanha = { servidor: string; porta: number; usuario: string; senha: string };

/** A caixa que manda (o Zoho Mail do Marcelo, com a senha de app). */
export function configSmtpCampanha(): ConfigCampanha | null {
  const usuario = (process.env.CAMPANHA_SMTP_USUARIO || "").trim();
  const senha = process.env.CAMPANHA_SMTP_SENHA || "";
  if (!usuario || !senha) return null;
  return {
    servidor: (process.env.CAMPANHA_SMTP_SERVIDOR || "smtp.zoho.com").trim(),
    porta: Number(process.env.CAMPANHA_SMTP_PORTA || 465) || 465,
    usuario,
    senha,
  };
}

/** O que o Admin mostra (sem a senha). */
export function situacaoSmtpCampanha() {
  return {
    usuario: (process.env.CAMPANHA_SMTP_USUARIO || "").trim() || null,
    servidor: (process.env.CAMPANHA_SMTP_SERVIDOR || "smtp.zoho.com").trim(),
    temSenha: Boolean(process.env.CAMPANHA_SMTP_SENHA),
  };
}

type Proximo = {
  id: number;
  token: string;
  nome: string;
  email: string;
  assunto: string;
  texto: string;
  remetente_nome: string;
  remetente_email: string;
};

export async function enviarEmailAsEmpresas(): Promise<{ enviados: number; motivo?: string }> {
  const smtp = configSmtpCampanha();
  const acesso = acessoFila();
  if (!smtp || !acesso) return { enviados: 0 };
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_email_empresas_pegar", { p_chave: chave });
  if (error) {
    // sem a migração: nada
    if (error.code === "PGRST202") return { enviados: 0 };
    console.error("Publike: falha ao ler o e-mail às empresas:", error.message);
    return { enviados: 0, motivo: "Não foi possível ler a fila do e-mail às empresas." };
  }
  const p = data as Proximo | null;
  if (!p) return { enviados: 0 };

  const marcar = async (ok: boolean, erro?: string) => {
    const { error: e } = await cliente.rpc("servidor_email_empresas_marcar", {
      p_chave: chave,
      p_id: p.id,
      p_ok: ok,
      p_erro: erro ?? null,
    });
    if (e) console.error(`Publike: não deu para marcar o e-mail às empresas ${p.id}:`, e.message);
  };
  if (!emailValido(p.email)) {
    await marcar(false, "Endereço de e-mail inválido.");
    return { enviados: 0 };
  }
  const email = montarEmailEmpresas(
    { assunto: p.assunto, texto: p.texto, remetenteNome: p.remetente_nome },
    { empresa: p.nome, token: p.token, site: SITE_URL },
  );
  const transporte = nodemailer.createTransport({
    host: smtp.servidor,
    port: smtp.porta,
    secure: smtp.porta === 465,
    requireTLS: smtp.porta === 587,
    auth: { user: smtp.usuario, pass: smtp.senha },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transporte.sendMail({
      // o Zoho Mail só deixa sair pela própria caixa: o endereço é o da conta; a resposta vai para o remetente
      from: { name: p.remetente_nome, address: smtp.usuario.includes("@") ? smtp.usuario : p.remetente_email },
      replyTo: emailValido(p.remetente_email) ? p.remetente_email : undefined,
      to: p.email,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${linkDeSairUmToque(SITE_URL, p.token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    const erro = textoDoErro(e);
    console.error(`Publike: o e-mail às empresas ${p.id} não saiu:`, erro);
    await marcar(false, erro);
    return { enviados: 0, motivo: `E-mail às empresas: ${erro}`.slice(0, 300) };
  } finally {
    transporte.close();
  }
  await marcar(true);
  return { enviados: 1 };
}
