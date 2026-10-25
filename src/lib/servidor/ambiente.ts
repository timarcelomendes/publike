import "server-only";
import { SITE_URL } from "@/lib/config";

// Variáveis que só o servidor lê (nunca vão para o navegador).
// Ficam no .env.local do seu computador e, no site publicado, no painel da
// hospedagem. Nenhuma delas fica no banco nem no admin.

/** Chave secreta do Supabase. Só no seu computador: é ela que abre o admin. */
export function chaveSecretaSupabase() {
  return (process.env.SUPABASE_SECRET_KEY || "").trim();
}

/**
 * Chave do servidor: só serve para mandar os e-mails e rodar a IA. Gerada no admin.
 * Também vale a linha inteira colada como valor ("PUBLIKE_CHAVE_SERVIDOR=publike_…", com ou sem aspas): ao
 * editar a variável na Vercel, o que se cola no campo Value vira o valor, com o nome junto, e o banco recusava.
 */
export function chaveDoServidor() {
  return (process.env.PUBLIKE_CHAVE_SERVIDOR || "")
    .trim()
    .replace(/^(?:export\s+)?PUBLIKE_CHAVE_SERVIDOR\s*=\s*/, "")
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
}

export type ConfigSmtp = {
  servidor: string;
  porta: number;
  seguro: boolean;
  usuario: string;
  senha: string;
  remetente: string;
};

/**
 * Quem aparece como remetente. No Zoho CPaaS (ZeptoMail) o usuário do SMTP é
 * "emailapikey", então o endereço vem de SMTP_REMETENTE; sem ele, vale o
 * usuário quando é um e-mail (contas comuns, como a do Zoho Mail).
 */
function remetenteSmtp(usuario: string) {
  const explicito = (process.env.SMTP_REMETENTE || "").trim();
  if (explicito) return explicito;
  return usuario.includes("@") ? usuario : "";
}

/** Serviço que manda os avisos do site (Zoho CPaaS). */
export function configSmtp(): ConfigSmtp | null {
  const servidor = (process.env.SMTP_SERVIDOR || "").trim();
  const usuario = (process.env.SMTP_USUARIO || "").trim();
  const senha = process.env.SMTP_SENHA || "";
  const remetente = remetenteSmtp(usuario);
  if (!servidor || !usuario || !senha || !remetente) return null;
  const porta = Number(process.env.SMTP_PORTA || 465) || 465;
  // 465: conexão já começa protegida (SSL). 587: começa aberta e sobe para TLS.
  return { servidor, porta, seguro: porta === 465, usuario, senha, remetente };
}

/** O que o admin pode mostrar sobre o e-mail (sem a senha). */
export function situacaoSmtp() {
  const usuario = (process.env.SMTP_USUARIO || "").trim();
  return {
    servidor: (process.env.SMTP_SERVIDOR || "").trim() || null,
    porta: Number(process.env.SMTP_PORTA || 465) || 465,
    usuario: usuario || null,
    remetente: remetenteSmtp(usuario) || null,
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

/** O valor da variável, tolerando a linha inteira colada ("NOME=valor", com ou sem aspas). */
function valorColado(nome: string) {
  return (process.env[nome] || "")
    .trim()
    .replace(new RegExp(`^(?:export\\s+)?${nome}\\s*=\\s*`), "")
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
}

/**
 * Chaves das notificações no celular (VAPID), geradas no admin (Chaves › Notificações no celular).
 * A pública vai para o navegador (é com ela que o aparelho se inscreve); a privada só o servidor lê.
 * Sem as duas, o botão "Ativar notificações" não aparece.
 */
export function chavesVapid(): { publica: string; privada: string; contato: string } | null {
  const publica = valorColado("PUBLIKE_VAPID_PUBLICA");
  const privada = valorColado("PUBLIKE_VAPID_PRIVADA");
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(publica) || !/^[A-Za-z0-9_-]{42,44}$/.test(privada)) return null;
  return { publica, privada, contato: "mailto:development@publike.org" };
}

/** Só a chave pública (pode ir para o navegador). */
export function vapidPublica(): string | null {
  return chavesVapid()?.publica ?? null;
}
