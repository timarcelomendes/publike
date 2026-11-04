import "server-only";
import nodemailer from "nodemailer";
import { montarEmail, type ModeloEmail } from "@/lib/email/montar";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { configSmtp, urlDosEmails } from "./ambiente";
import { logoDosEmails } from "./filas";

// E-mail de acesso mandado pelo admin: a conta foi criada pela equipe (ou a
// pessoa pediu ajuda para entrar) e recebe um link de entrar. Sai na hora,
// pelo mesmo e-mail do site, e não passa pela fila: o link vale pouco tempo e
// não fica guardado no banco.

const MODELO_PRIMEIRO: ModeloEmail = {
  modelo: "conta_acesso",
  grupo: "conta",
  assunto: "Sua conta no Publike está pronta",
  corpo: `Olá, {{nome}}!

Criamos a sua conta no Publike, o mural de vagas e serviços, como combinamos.

{{publicados}}

Toque no botão para entrar. Não precisa de senha. No primeiro acesso, confira os seus dados e aceite as regras e a política de privacidade.

O link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.

Não pediu esta conta? É só ignorar este e-mail ou responder avisando, que a gente apaga.`,
  botao: "Entrar no Publike",
};

const MODELO_DE_NOVO: ModeloEmail = {
  modelo: "conta_acesso",
  grupo: "conta",
  assunto: "Seu link para entrar no Publike",
  corpo: `Olá, {{nome}}!

Aqui está o seu link para entrar no Publike. Não precisa de senha.

{{publicados}}

O link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.`,
  botao: "Entrar no Publike",
};

export type ResultadoAcesso = { ok: true } | { ok: false; erro: string };

/**
 * Gera o link de entrar (Supabase Auth) e manda o e-mail. `primeiro`: a conta
 * acabou de ser criada pela equipe (texto de boas-vindas).
 */
export async function mandarEmailDeAcesso(
  c: ClienteBanco,
  dados: { email: string; nome: string; primeiro: boolean; vagas: number; servicos: number },
): Promise<ResultadoAcesso> {
  const smtp = configSmtp();
  if (!smtp) return { ok: false, erro: "Falta configurar o e-mail do site (SMTP_SERVIDOR, SMTP_USUARIO, SMTP_SENHA)." };
  // a chave e o texto ficam em Admin › E-mails (migração 20270201120000; sem ela, vale o texto daqui)
  const chave = dados.primeiro ? "conta_acesso" : "conta_acesso_link";
  const { data: ligado, error: semChave } = await c.rpc("admin_email_ligado", { p_modelo: chave });
  if (!semChave && ligado === false)
    return { ok: false, erro: "Este e-mail está desligado em Admin › E-mails › Todos os e-mails." };
  // o link precisa abrir no site publicado, não no seu computador
  const site = urlDosEmails();
  if (!site) return { ok: false, erro: "Falta o endereço do site no ar (PUBLIKE_URL_PUBLICA) para montar o link." };

  const { data, error } = await c.auth.admin.generateLink({ type: "magiclink", email: dados.email });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.error("Publike: o Supabase não gerou o link de entrar:", error?.message);
    return { ok: false, erro: "O Supabase não gerou o link agora. Tente de novo daqui a pouco." };
  }

  // o primeiro acesso passa pelo perfil, para a pessoa conferir os dados e aceitar as regras
  const proximo = dados.primeiro ? "/perfil?completar=1&next=/painel" : "/painel";
  const params = new URLSearchParams({ token_hash: token, type: "magiclink", next: proximo });
  const { data: cfg } = await c.from("config_site").select("remetente_nome, responder_para").limit(1).maybeSingle();
  // parágrafo com variável vazia some do e-mail (veja montarEmail)
  const partes = [
    dados.vagas > 0 &&
      `${dados.vagas === 1 ? "A sua vaga já está" : `As suas ${dados.vagas} vagas já estão`} no ar. Pelo painel você vê quem se candidatou e conversa com cada pessoa.`,
    dados.servicos > 0 &&
      `A sua vitrine de serviços já está no ar${dados.servicos > 1 ? `, com ${dados.servicos} serviços` : ""}. Quem mora perto encontra você e chama pelo WhatsApp; pelo painel você troca preços, fotos e horários.`,
  ];
  const publicados = partes.filter(Boolean).join(" ");
  const padrao = dados.primeiro ? MODELO_PRIMEIRO : MODELO_DE_NOVO;
  // o texto editado em Admin › E-mails › Textos (sem ele, o daqui)
  const { data: modelos } = await c.rpc("admin_modelos_email");
  const doBanco = (modelos ?? []).find((m) => m.chave === chave);
  const modelo: ModeloEmail = doBanco
    ? { ...padrao, assunto: doBanco.assunto, corpo: doBanco.corpo, botao: doBanco.botao }
    : padrao;
  const email = montarEmail(
    modelo,
    { nome: dados.nome, email: dados.email, publicados, caminho: `/auth/callback?${params}` },
    site,
    await logoDosEmails(c, site),
  );

  const transporte = nodemailer.createTransport({
    host: smtp.servidor,
    port: smtp.porta,
    secure: smtp.seguro,
    requireTLS: !smtp.seguro,
    auth: { user: smtp.usuario, pass: smtp.senha },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transporte.sendMail({
      from: { name: cfg?.remetente_nome || "Publike", address: smtp.remetente },
      to: dados.email,
      replyTo: cfg?.responder_para || undefined,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
    console.error("Publike: o e-mail de acesso não saiu:", erro);
    return { ok: false, erro: `O servidor de e-mail recusou o envio: ${erro}` };
  } finally {
    transporte.close();
  }
  // para os números e Enviados de Admin › E-mails (sem o link)
  const { error: semRegistro } = await c.rpc("admin_registrar_email_direto", {
    p_modelo: chave,
    p_para: dados.email,
    p_usuario: null,
  });
  if (semRegistro && semRegistro.code !== "PGRST202")
    console.error("Publike: o e-mail de acesso saiu, mas não ficou registrado:", semRegistro.message);
  return { ok: true };
}
