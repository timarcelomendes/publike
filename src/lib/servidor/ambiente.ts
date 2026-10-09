import "server-only";
import { SITE_URL } from "@/lib/config";

// Variáveis que só o servidor lê (nunca vão para o navegador).
// Ficam no .env.local do seu computador e, no site publicado, no painel da
// hospedagem. Nenhuma delas fica no banco nem no admin.

/** Chave secreta do Supabase. Só no seu computador: é ela que abre o admin. */
export function chaveSecretaSupabase() {
  return (process.env.SUPABASE_SECRET_KEY || "").trim();
}

/** Chave do servidor: só serve para mandar os e-mails e rodar a IA. Gerada no admin. */
export function chaveDoServidor() {
  return (process.env.PUBLIKE_CHAVE_SERVIDOR || "").trim();
}

export type ConfigSmtp = { servidor: string; porta: number; seguro: boolean; usuario: string; senha: string };

/** Conta do Zoho que manda os avisos do site. */
export function configSmtp(): ConfigSmtp | null {
  const servidor = (process.env.SMTP_SERVIDOR || "").trim();
  const usuario = (process.env.SMTP_USUARIO || "").trim();
  const senha = process.env.SMTP_SENHA || "";
  if (!servidor || !usuario || !senha) return null;
  const porta = Number(process.env.SMTP_PORTA || 465) || 465;
  // 465: conexão já começa protegida (SSL). 587: começa aberta e sobe para TLS.
  return { servidor, porta, seguro: porta === 465, usuario, senha };
}

/** O que o admin pode mostrar sobre o e-mail (sem a senha). */
export function situacaoSmtp() {
  return {
    servidor: (process.env.SMTP_SERVIDOR || "").trim() || null,
    porta: Number(process.env.SMTP_PORTA || 465) || 465,
    usuario: (process.env.SMTP_USUARIO || "").trim() || null,
    temSenha: Boolean(process.env.SMTP_SENHA),
  };
}

/** Chave da API da OpenAI. */
export function chaveIA() {
  return (process.env.OPENAI_API_KEY || "").trim();
}

/** Endereço da API da IA. Só muda em teste; nunca vem do admin. */
export function enderecoIA() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
}

/**
 * Endereço do site nos links dos e-mails. Só um endereço público serve:
 * e-mail com link para localhost não abre no celular de ninguém.
 * No seu computador, PUBLIKE_URL_PUBLICA diz qual é o site no ar.
 */
export function urlDosEmails(): string | null {
  const explicita = (process.env.PUBLIKE_URL_PUBLICA || "").trim().replace(/\/+$/, "");
  if (explicita) return explicita;
  try {
    const url = new URL(SITE_URL);
    if (url.protocol === "https:" && !/^(localhost|127\.|\[::1\])/i.test(url.hostname)) {
      return SITE_URL.replace(/\/+$/, "");
    }
  } catch {
    // endereço inválido: trata como não público
  }
  return null;
}
