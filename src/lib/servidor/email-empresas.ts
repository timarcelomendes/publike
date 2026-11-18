import "server-only";
import nodemailer from "nodemailer";
import { SITE_URL } from "@/lib/config";
import { emailValido } from "@/lib/email-valido";
import { linkDeSairUmToque, montarEmailEmpresas } from "@/lib/email-empresas";
import { acessoFila } from "./filas";
import { textoDoErro } from "./falhas";

// O e-mail às empresas (18/11/2026; migrações 20270722120000 e 20270727120000). Sai pela caixa do Marcelo no Email
// Profissional da GoDaddy (Titan): marcelo@publike.org, pelo smtpout.secureserver.net. Não sai pelo serviço dos avisos
// do site: o ZeptoMail (Zoho) só aceita e-mail transacional, e um bloqueio por prospecção pararia também os links de
// entrar e os avisos.
// Um por vez, quando o banco diz que é a hora (dia útil, no horário, abaixo do limite do dia e espaçado). Sem as
// variáveis CAMPANHA_SMTP_*, nada sai. Quando a caixa recusa (o login, o remetente, a conexão), a empresa volta para a
// fila e o envio para ou espera: nenhuma empresa fica marcada como falha por um problema da caixa.

type ConfigCampanha = { servidor: string; porta: number; usuario: string; senha: string };

/**
 * O servidor da caixa: as caixas do publike.org são o Email Profissional da GoDaddy (Titan), que envia pelo
 * smtpout.secureserver.net, porta 465 com SSL, com o endereço inteiro e a senha da caixa
 * (https://www.godaddy.com/pt-br/help/set-up-third-party-plugins-or-websites-using-smtp-settings-42788).
 * CAMPANHA_SMTP_SERVIDOR troca. (18/11: o padrão era o do Zoho, que não conhece a caixa do Marcelo, e o login voltou
 * "535 Authentication Failed".)
 */
function servidorDaCampanha() {
  return (process.env.CAMPANHA_SMTP_SERVIDOR || "").trim() || "smtpout.secureserver.net";
}

/** A caixa que manda (a do Marcelo na GoDaddy, com a senha dela). */
export function configSmtpCampanha(): ConfigCampanha | null {
  const usuario = (process.env.CAMPANHA_SMTP_USUARIO || "").trim();
  // a senha colada com espaço ou quebra de linha no fim recusaria o login
  const senha = (process.env.CAMPANHA_SMTP_SENHA || "").trim();
  if (!usuario || !senha) return null;
  return {
    servidor: servidorDaCampanha(),
    porta: Number(process.env.CAMPANHA_SMTP_PORTA || 465) || 465,
    usuario,
    senha,
  };
}

/** O que o Admin mostra (sem a senha). */
export function situacaoSmtpCampanha() {
  const usuario = (process.env.CAMPANHA_SMTP_USUARIO || "").trim();
  return {
    usuario: usuario || null,
    servidor: servidorDaCampanha(),
    temSenha: Boolean((process.env.CAMPANHA_SMTP_SENHA || "").trim()),
  };
}

/**
 * O problema é da caixa (e não da empresa)? `desligar`: o login, o remetente ou o conteúdo recusados, que só a equipe
 * conserta; senão, a conexão que caiu, que espera 30 minutos. null: o problema é do endereço da empresa.
 */
function problemaDaCaixa(e: unknown): { motivo: string; desligar: boolean } | null {
  const erro = (e ?? {}) as { code?: string; responseCode?: number; command?: string; message?: string };
  const codigo = String(erro.code ?? "");
  const resposta = Number(erro.responseCode ?? 0);
  const comando = String(erro.command ?? "").toUpperCase();
  const texto = String(erro.message ?? "").slice(0, 200);
  if (codigo === "EAUTH" || resposta === 535 || resposta === 534 || resposta === 530 || comando.startsWith("AUTH")) {
    return {
      motivo: `A caixa recusou o login (${resposta || codigo}): confira, na Vercel, o CAMPANHA_SMTP_USUARIO (o endereço inteiro, como marcelo@publike.org) e o CAMPANHA_SMTP_SENHA (a senha dessa caixa, a mesma do webmail da GoDaddy).`,
      desligar: true,
    };
  }
  if (comando.startsWith("MAIL FROM")) {
    return {
      motivo: `A caixa não deixou sair com este remetente (${resposta || codigo}): o remetente precisa ser a própria caixa do login (ou um apelido dela). ${texto}`,
      desligar: true,
    };
  }
  if (comando === "DATA" || comando.startsWith("DATA")) {
    return { motivo: `A caixa recusou a mensagem (${resposta || codigo}): ${texto}`, desligar: true };
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "ECONNREFUSED", "ECONNRESET", "EPROTOCOL"].includes(codigo)) {
    return { motivo: `Não deu para falar com a caixa (${codigo}): ${texto}`, desligar: false };
  }
  return null;
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
  // o remetente é o do Admin (marcelo@publike.org, a própria caixa do login); sem remetente válido, o login
  const de = emailValido(p.remetente_email) ? p.remetente_email : smtp.usuario;
  try {
    await transporte.sendMail({
      from: { name: p.remetente_nome, address: de },
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
    const daCaixa = problemaDaCaixa(e);
    if (daCaixa) {
      // a empresa volta para a fila; o envio para (ou espera) até a caixa estar certa
      const { error: e2 } = await cliente.rpc("servidor_email_empresas_devolver", {
        p_chave: chave,
        p_id: p.id,
        p_motivo: daCaixa.motivo,
        p_desligar: daCaixa.desligar,
      });
      if (!e2) return { enviados: 0, motivo: `E-mail às empresas: ${daCaixa.motivo}`.slice(0, 300) };
      // sem a migração 20270727120000: como antes
      if (e2.code !== "PGRST202") console.error(`Publike: não deu para devolver o e-mail às empresas ${p.id}:`, e2.message);
    }
    await marcar(false, erro);
    return { enviados: 0, motivo: `E-mail às empresas: ${erro}`.slice(0, 300) };
  } finally {
    transporte.close();
  }
  await marcar(true);
  return { enviados: 1 };
}
