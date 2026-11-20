import "server-only";
import { randomUUID } from "node:crypto";
import { promises as dns } from "node:dns";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { SITE_URL } from "@/lib/config";
import { enderecosQueVoltaram, motivoDeEmailRuim } from "@/lib/email-ruim";
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

/**
 * A cópia em "Enviados" (18/11/2026, Marcelo: "sim" para guardar a cópia; migração 20270729120000): o SMTP não guarda
 * o que sai, então o robô entra na caixa pelo IMAP (o da GoDaddy para o Email Profissional: imap.secureserver.net,
 * porta 993, com SSL, o mesmo usuário e senha) e põe a mesma mensagem na pasta de enviados, como lida.
 * CAMPANHA_IMAP_SERVIDOR e CAMPANHA_IMAP_PORTA trocam; CAMPANHA_IMAP_SERVIDOR = "nao" desliga a cópia.
 * Devolve o erro (ou null): a cópia que falha não desfaz o envio.
 */
async function guardarEmEnviados(smtp: ConfigCampanha, mensagem: Buffer): Promise<string | null> {
  const servidor = (process.env.CAMPANHA_IMAP_SERVIDOR || "").trim() || "imap.secureserver.net";
  if (servidor.toLowerCase() === "nao") return null;
  const porta = Number(process.env.CAMPANHA_IMAP_PORTA || 993) || 993;
  const caixa = new ImapFlow({
    host: servidor,
    port: porta,
    // a 993 é com SSL; noutra porta, o IMAP começa sem e passa para TLS (STARTTLS) quando o servidor oferece
    secure: porta === 993,
    auth: { user: smtp.usuario, pass: smtp.senha },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  // sem isto, um erro da conexão depois do connect derruba o processo
  caixa.on("error", () => {});
  try {
    await caixa.connect();
    const pastas = await caixa.list();
    const enviados =
      pastas.find((x) => x.specialUse === "\\Sent") ??
      pastas.find((x) => /^(sent|sent items|sent messages|enviados|itens enviados|mensagens enviadas)$/i.test(x.name));
    if (!enviados) return "a caixa não tem a pasta de enviados";
    await caixa.append(enviados.path, mensagem, ["\\Seen"], new Date());
    return null;
  } catch (e) {
    return textoDoErro(e);
  } finally {
    await caixa.logout().catch(() => {});
  }
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

// --- Os endereços ruins (20/11/2026; Marcelo: "os e-mails estão vindo muitos ruins"; migração 20270812120000) -----

/** O domínio recebe e-mail? false: com certeza não (não existe, ou não tem MX nem endereço); null: não deu para saber. */
const dominiosConferidos = new Map<string, boolean | null>();
// o DNS daqui responde? Sem ele, todo domínio pareceria não existir: na dúvida, nenhum é marcado
let dnsResponde: Promise<boolean> | null = null;
async function dominioRecebe(dominio: string): Promise<boolean | null> {
  if (dominiosConferidos.has(dominio)) return dominiosConferidos.get(dominio)!;
  dnsResponde ??= dns
    .resolveMx("gmail.com")
    .then((m) => m.length > 0)
    .catch(() => false);
  if (!(await dnsResponde)) {
    dnsResponde = null;
    return null;
  }
  const comPrazo = <T,>(pr: Promise<T>) =>
    Promise.race([pr, new Promise<never>((_, nao) => setTimeout(() => nao(Object.assign(new Error("prazo"), { code: "ETIMEOUT" })), 5000))]);
  const naoExiste = (e: unknown) => ["ENOTFOUND", "ENODATA"].includes(String((e as { code?: string })?.code));
  let r: boolean | null;
  try {
    const mx = await comPrazo(dns.resolveMx(dominio));
    // "MX 0 ." é o domínio dizendo que não recebe e-mail (RFC 7505)
    r = mx.some((m) => m.exchange && m.exchange !== ".");
  } catch (e) {
    if (!naoExiste(e)) r = null;
    else {
      // sem MX, o e-mail vai para o endereço do próprio domínio (RFC 5321); sem nenhum dos dois, não recebe
      try {
        r = (await comPrazo(dns.resolve4(dominio))).length > 0;
      } catch (e2) {
        r = naoExiste(e2) ? false : null;
      }
    }
  }
  dominiosConferidos.set(dominio, r);
  return r;
}

/** Por que o endereço não deve sair (de mentira ou domínio que não recebe), ou null. Na dúvida, sai. */
export async function motivoParaNaoMandar(email: string): Promise<string | null> {
  if (!emailValido(email)) return "Endereço de e-mail inválido.";
  const mentira = motivoDeEmailRuim(email);
  if (mentira) return mentira;
  const dominio = email.trim().toLowerCase().split("@")[1];
  return (await dominioRecebe(dominio)) === false ? `o domínio ${dominio} não recebe e-mail` : null;
}

async function lerDevolvidos(smtp: ConfigCampanha, cliente: NonNullable<ReturnType<typeof acessoFila>>["cliente"], chave: string) {
  const { data: agora, error } = await cliente.rpc("servidor_email_empresas_ler_devolvidos", { p_chave: chave });
  if (error || !agora) return;
  const servidor = (process.env.CAMPANHA_IMAP_SERVIDOR || "").trim() || "imap.secureserver.net";
  if (servidor.toLowerCase() === "nao") return;
  const porta = Number(process.env.CAMPANHA_IMAP_PORTA || 993) || 993;
  const caixa = new ImapFlow({
    host: servidor,
    port: porta,
    secure: porta === 993,
    auth: { user: smtp.usuario, pass: smtp.senha },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  caixa.on("error", () => {});
  const itens: { email: string; motivo: string }[] = [];
  try {
    await caixa.connect();
    const trava = await caixa.getMailboxLock("INBOX", { readOnly: true });
    try {
      const desde = new Date(Date.now() - 7 * 86_400_000);
      const uids = new Set<number>();
      for (const de of ["mailer-daemon", "postmaster"]) {
        const achou = await caixa.search({ since: desde, from: de }, { uid: true });
        for (const u of achou || []) uids.add(u);
      }
      const lista = [...uids].slice(-100);
      if (lista.length)
        for await (const m of caixa.fetch(lista, { source: true }, { uid: true })) {
          if (m.source) itens.push(...enderecosQueVoltaram(m.source.toString("utf8").slice(0, 60_000)));
        }
    } finally {
      trava.release();
    }
  } catch (e) {
    console.error("Publike: não deu para ler os avisos de não entregue:", textoDoErro(e));
    return;
  } finally {
    await caixa.logout().catch(() => {});
  }
  if (!itens.length) return;
  const { error: e2 } = await cliente.rpc("servidor_email_empresas_voltaram", { p_chave: chave, p_itens: itens.slice(0, 200) });
  if (e2) console.error("Publike: não deu para marcar os e-mails que voltaram:", e2.message);
}

export async function enviarEmailAsEmpresas(): Promise<{ enviados: number; motivo?: string; copia?: boolean }> {
  const smtp = configSmtpCampanha();
  const acesso = acessoFila();
  if (!smtp || !acesso) return { enviados: 0 };
  const { cliente, chave } = acesso;
  // os avisos de não entregue (a cada 30 minutos): o endereço que voltou não sai de novo
  await lerDevolvidos(smtp, cliente, chave).catch((e) => console.error("Publike: avisos de não entregue:", textoDoErro(e)));
  // o próximo endereço bom: os ruins viram "invalido" sem gastar o envio do dia (até 10 por vez)
  let p: Proximo | null = null;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await cliente.rpc("servidor_email_empresas_pegar", { p_chave: chave });
    if (error) {
      // sem a migração: nada
      if (error.code === "PGRST202") return { enviados: 0 };
      console.error("Publike: falha ao ler o e-mail às empresas:", error.message);
      return { enviados: 0, motivo: "Não foi possível ler a fila do e-mail às empresas." };
    }
    const proximo = data as Proximo | null;
    if (!proximo) return { enviados: 0 };
    const ruim = await motivoParaNaoMandar(proximo.email);
    if (!ruim) {
      p = proximo;
      break;
    }
    const { error: e1 } = await cliente.rpc("servidor_email_empresas_invalido", {
      p_chave: chave,
      p_id: proximo.id,
      p_motivo: ruim,
    });
    if (e1) {
      // sem a migração 20270812120000: como antes
      await cliente.rpc("servidor_email_empresas_marcar", { p_chave: chave, p_id: proximo.id, p_ok: false, p_erro: ruim });
      return { enviados: 0 };
    }
  }
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
  // a mensagem montada uma vez: a mesma sai pelo SMTP e vai para "Enviados" (com o mesmo Message-ID, a resposta da
  // empresa cai na mesma conversa)
  let mensagem: Buffer;
  try {
    mensagem = await new MailComposer({
      from: { name: p.remetente_nome, address: de },
      replyTo: emailValido(p.remetente_email) ? p.remetente_email : undefined,
      to: p.email,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
      date: new Date(),
      messageId: `<${randomUUID()}@publike.org>`,
      headers: {
        "List-Unsubscribe": `<${linkDeSairUmToque(SITE_URL, p.token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    })
      .compile()
      .build();
  } catch (e) {
    const erro = textoDoErro(e);
    console.error(`Publike: o e-mail às empresas ${p.id} não foi montado:`, erro);
    await marcar(false, erro);
    transporte.close();
    return { enviados: 0, motivo: `E-mail às empresas: ${erro}`.slice(0, 300) };
  }
  try {
    await transporte.sendMail({ envelope: { from: de, to: [p.email] }, raw: mensagem });
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
  // a cópia em "Enviados": o resultado fica no banco para o Admin mostrar (sem a migração, só no registro)
  const erroDaCopia = await guardarEmEnviados(smtp, mensagem);
  if (erroDaCopia) console.error(`Publike: a cópia do e-mail às empresas ${p.id} não foi para Enviados:`, erroDaCopia);
  const { error: e3 } = await cliente.rpc("servidor_email_empresas_copia", { p_chave: chave, p_erro: erroDaCopia });
  if (e3 && e3.code !== "PGRST202") console.error("Publike: não deu para guardar o resultado da cópia:", e3.message);
  return { enviados: 1, copia: !erroDaCopia };
}
