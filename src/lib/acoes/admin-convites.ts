"use server";

import { refresh } from "next/cache";
import nodemailer from "nodemailer";
import {
  assuntoConvite,
  limparTelefone,
  linkDoConvite,
  mensagemConvite,
  rascunhoValido,
  STATUS_CONVITE,
  type Convite,
  type NovoConvite,
  type StatusConvite,
} from "@/lib/convites";
import { escaparHtml } from "@/lib/email/montar";
import { configSmtp, urlDosEmails } from "@/lib/servidor/ambiente";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { lerVagaDaImagem } from "@/lib/ia/vaga-da-imagem";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Convites às empresas: importar a lista, marcar a situação e anotar. Só no admin.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const TEL = /^\d{10,11}$/;

function conferir(n: NovoConvite): NovoConvite | null {
  const nome = String(n?.nome ?? "").trim();
  if (nome.length < 2 || nome.length > 120) return null;
  const lista = (v: unknown, max: number, tam: number) =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim().slice(0, tam))
          .filter(Boolean)
          .slice(0, max)
      : [];
  const whatsapp = lista(n.whatsapp, 5, 11).filter((t) => TEL.test(t));
  const telefones = lista(n.telefones, 5, 11).filter((t) => TEL.test(t));
  const email =
    typeof n.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.email) ? n.email.slice(0, 200) : null;
  return {
    nome,
    tipo: n.tipo === "agencia" ? "agencia" : "empresa",
    vagas: lista(n.vagas, 20, 80),
    whatsapp,
    telefones,
    email,
    observacao: typeof n.observacao === "string" && n.observacao.trim() ? n.observacao.trim().slice(0, 500) : null,
    rascunho: rascunhoValido(n.rascunho),
    origem: n.origem === "imagem" ? "imagem" : "arquivo",
  };
}

/** Importa as empresas do arquivo. Quem já está na lista (mesmo nome) fica como está. */
export async function importarConvites(itens: NovoConvite[]): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Array.isArray(itens) || !itens.length)
    return { ok: false, erro: "O arquivo não tem nenhuma empresa para importar." };
  if (itens.length > 500) return { ok: false, erro: "São mais de 500 empresas: divida o arquivo em partes." };
  const limpos = itens.map(conferir).filter((n): n is NovoConvite => Boolean(n));

  const { data: atuais, error: erroLer } = await c.from("convites").select("nome");
  if (erroLer)
    return { ok: false, erro: mensagemDeErro(erroLer, "Não deu para ler a lista. A migração dos convites já rodou?") };
  const chave = (s: string) => s.trim().toLowerCase();
  const existentes = new Set((atuais ?? []).map((a) => chave(a.nome)));
  const novos = limpos.filter((n) => !existentes.has(chave(n.nome)));
  if (novos.length) {
    const { error } = await c.from("convites").insert(novos);
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para importar agora.") };
  }
  refresh();
  const repetidas = limpos.length - novos.length;
  return {
    ok: true,
    mensagem:
      `${novos.length === 1 ? "1 empresa entrou" : `${novos.length} empresas entraram`} na lista.` +
      (repetidas ? ` ${repetidas === 1 ? "1 já estava" : `${repetidas} já estavam`} e ficaram como estavam.` : ""),
  };
}

/** Muda a situação do convite (e guarda quando foi enviado). */
export async function mudarConvite(id: string, status: StatusConvite): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || !STATUS_CONVITE.includes(status)) return { ok: false, erro: "Pedido inválido." };
  const { data: antes } = await c.from("convites").select("status, enviada_em").eq("id", id).maybeSingle();
  if (!antes) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const mudanca: { status: StatusConvite; enviada_em?: string } = { status };
  if (status === "enviada" && !antes.enviada_em) mudanca.enviada_em = new Date().toISOString();
  const { error } = await c.from("convites").update(mudanca).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

export async function anotarConvite(id: string, nota: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c
    .from("convites")
    .update({ nota: nota.trim().slice(0, 500) || null })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true, mensagem: "Anotação salva." };
}

export async function apagarConvite(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/**
 * Lê a imagem de um anúncio de vaga com a IA e devolve a empresa pronta para importar
 * (ou o motivo de ter ficado de fora). Nada é salvo: o admin confere antes de importar.
 */
export async function lerConviteDaImagem(
  imagem: string,
  nomeArquivo: string,
): Promise<{ ok: true; convite: NovoConvite } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (typeof imagem !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imagem))
    return { ok: false, erro: "Arquivo que não é imagem." };
  if (imagem.length > 2_000_000) return { ok: false, erro: "Imagem grande demais." };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA (OPENAI_API_KEY) no .env.local." };
  const { data: cfg } = await c.from("config_site").select("ia_modelo").limit(1).maybeSingle();
  let lida;
  try {
    lida = await lerVagaDaImagem(imagem, String(nomeArquivo ?? ""), cfg?.ia_modelo ?? MODELO_PADRAO);
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu ler esta imagem." };
  }
  if (!lida.e_vaga) return { ok: false, erro: `Não parece anúncio de vaga${lida.motivo ? `: ${lida.motivo}` : "."}` };
  const nome = (lida.empresa || "").replace(/\s+/g, " ").trim();
  if (nome.length < 2) return { ok: false, erro: "A imagem não diz o nome da empresa." };
  const fones = (l: unknown) =>
    [
      ...new Set(
        (Array.isArray(l) ? l : []).map((t) => limparTelefone(String(t))).filter((t): t is string => Boolean(t)),
      ),
    ].slice(0, 5);
  const whatsapp = fones(lida.whatsapp);
  const telefones = fones(lida.telefones).filter((t) => !whatsapp.includes(t));
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lida.email ?? "") ? lida.email.toLowerCase().slice(0, 200) : null;
  if (!whatsapp.length && !telefones.length && !email)
    return { ok: false, erro: `${nome}: a imagem não tem WhatsApp, telefone ou e-mail.` };
  const rascunho = rascunhoValido(lida.vaga);
  const cargos = (Array.isArray(lida.cargos) ? lida.cargos : [])
    .map((v) => String(v).trim().slice(0, 80))
    .filter(Boolean);
  return {
    ok: true,
    convite: {
      nome: nome.slice(0, 120),
      tipo: lida.tipo === "agencia" ? "agencia" : "empresa",
      vagas: [...new Set(cargos.length ? cargos : rascunho ? [rascunho.titulo] : [])].slice(0, 20),
      whatsapp,
      telefones,
      email,
      observacao: `Lida da imagem ${String(nomeArquivo ?? "").slice(0, 80)}`.trim(),
      rascunho,
      origem: "imagem",
    },
  };
}

/**
 * Manda o convite por e-mail direto pelo Publike (o mesmo SMTP dos avisos do site): sem depender
 * do programa de e-mail do computador. Deu certo: o convite fica como "Enviei".
 */
export async function enviarConviteEmail(id: string, assinatura: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const smtp = configSmtp();
  if (!smtp)
    return {
      ok: false,
      erro: "O envio de e-mail não está configurado neste computador (SMTP no .env.local). Use Copiar mensagem.",
    };
  const { data: conv } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!conv) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const convite = conv as unknown as Convite;
  const para = convite.email;
  if (!para) return { ok: false, erro: "Este convite não tem e-mail." };
  const site = urlDosEmails() ?? "https://publike.org";
  const link = linkDoConvite(site, convite.token);
  const texto = mensagemConvite(convite, String(assinatura ?? "").slice(0, 40), link, Boolean(convite.rascunho));
  const html = texto
    .split("\n\n")
    .map((p) =>
      p.includes(link)
        ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${escaparHtml(p.replace(link, "").trim()).replace(/\n/g, "<br>")}<br>` +
          `<a href="${escaparHtml(link)}" style="display:inline-block;margin-top:10px;padding:12px 20px;background:#c2410c;color:#ffffff;font-weight:600;text-decoration:none;border-radius:8px;">Conferir e publicar a vaga</a></p>`
        : `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
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
      from: { name: "Publike", address: smtp.remetente },
      to: para,
      subject: assuntoConvite(convite),
      text: texto,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f1a14;max-width:560px;">${html}</div>`,
    });
  } catch (e) {
    console.error("Publike: o convite por e-mail não saiu:", e instanceof Error ? e.message : String(e));
    return { ok: false, erro: "O e-mail não saiu. Confira o SMTP no .env.local ou use Copiar mensagem." };
  } finally {
    transporte.close();
  }
  if (convite.status === "a_enviar") {
    await c.from("convites").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  }
  refresh();
  return { ok: true, mensagem: `E-mail enviado para ${para}.` };
}
