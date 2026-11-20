"use server";

import { refresh } from "next/cache";
import { PUBLICOS_EMAIL_EMPRESAS, type PublicoEmailEmpresas } from "@/lib/email-empresas";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";

// O e-mail às empresas (migração 20270722120000): a resposta da empresa no botão do e-mail (sem conta) e, no Admin,
// o texto, o limite por dia, o horário e a fila. Só a equipe publike.org mexe no Admin.

const TOKEN = /^[0-9a-f]{64}$/;

export type RespostaEmailEmpresas = { ok: true; resposta: "sim" | "nao" } | { ok: false; erro: string };

export async function responderEmailEmpresas(
  token: string,
  resposta: "sim" | "nao",
  campos: { link?: string; telefone?: string; observacao?: string } = {},
): Promise<RespostaEmailEmpresas> {
  if (!TOKEN.test(token) || (resposta !== "sim" && resposta !== "nao")) return { ok: false, erro: "Este link não vale." };
  const link = (campos.link ?? "").trim();
  if (link && !/^https?:\/\/\S+\.\S+/i.test(link) && !/^\S+\.\S+/.test(link))
    return { ok: false, erro: "Confira o link das vagas (por exemplo, https://suaempresa.gupy.io)." };
  const { error } = await criarClientePublico().rpc("email_empresas_responder", {
    p_token: token,
    p_resposta: resposta,
    p_link: link.slice(0, 300) || null,
    p_telefone: (campos.telefone ?? "").trim().slice(0, 30) || null,
    p_observacao: (campos.observacao ?? "").trim().slice(0, 500) || null,
  });
  if (error) {
    console.error(`Publike: a resposta do e-mail às empresas não gravou: ${error.message}`);
    return { ok: false, erro: "Não deu para gravar agora. Tente de novo em instantes ou responda o e-mail." };
  }
  return { ok: true, resposta };
}

// ------------------------------------------------------------------ Admin

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/email-empresas")) ? await criarClienteServidor() : null);
}

type Feito = { ok: true; mensagem?: string } | { ok: false; erro: string };

export async function salvarEmailEmpresas(d: {
  ligado: boolean;
  porDia: string;
  horaInicio: string;
  horaFim: string;
  remetenteNome: string;
  assunto: string;
  texto: string;
}): Promise<Feito> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const n = (v: string, min: number, max: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x >= min && x <= max ? x : null;
  };
  const porDia = n(d.porDia, 1, 200);
  const inicio = n(d.horaInicio, 0, 23);
  const fim = n(d.horaFim, 1, 24);
  if (porDia === null) return { ok: false, erro: "Por dia: use um número inteiro de 1 a 200." };
  if (inicio === null || fim === null || fim <= inicio)
    return { ok: false, erro: "Horário: o começo de 0 a 23 e o fim depois dele, até 24." };
  if (!d.texto.includes("{empresa}") && !d.assunto.includes("{empresa}"))
    return { ok: false, erro: "Use {empresa} no assunto ou no texto: o e-mail chama a empresa pelo nome." };
  const { error } = await c.rpc("admin_email_empresas_salvar", {
    p_ligado: d.ligado,
    p_por_dia: porDia,
    p_hora_inicio: inicio,
    p_hora_fim: fim,
    p_remetente_nome: d.remetenteNome,
    p_assunto: d.assunto,
    p_texto: d.texto,
  });
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true, mensagem: d.ligado ? "Salvo. O envio está ligado." : "Salvo. O envio está desligado." };
}

export async function porNaFilaEmailEmpresas(publico: PublicoEmailEmpresas, quantos: number): Promise<Feito> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  if (!(publico in PUBLICOS_EMAIL_EMPRESAS)) return { ok: false, erro: "Público inválido." };
  const { data, error } = await c.rpc("admin_email_empresas_por_na_fila", {
    p_publico: publico,
    p_limite: Math.min(Math.max(Math.round(quantos) || 0, 1), 1000),
  });
  if (error) return { ok: false, erro: error.message };
  refresh();
  const n = Number(data) || 0;
  return { ok: true, mensagem: n ? `${n} na fila.` : "Ninguém novo para pôr na fila." };
}

export async function tirarDaFilaEmailEmpresas(publico: PublicoEmailEmpresas | null): Promise<Feito> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const { data, error } = await c.rpc("admin_email_empresas_tirar_da_fila", { p_publico: publico });
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true, mensagem: `${Number(data) || 0} saíram da fila.` };
}

// ------------------------------------------------------------------ Quem anunciou vaga (migração 20270814120000)

/** Uma empresa que anunciou vaga em outro lugar entra na fila (só o endereço da empresa, uma vez só). */
export async function porVagaEmailEmpresas(d: {
  nome: string;
  email: string;
  vaga: string;
  onde: string;
  link: string;
}): Promise<Feito> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const link = d.link.trim();
  if (link && !/^https?:\/\/\S+\.\S+/i.test(link))
    return { ok: false, erro: "Confira o link da vaga (começa com https://)." };
  const { data, error } = await c.rpc("admin_email_empresas_vaga_por", {
    p_nome: d.nome,
    p_email: d.email,
    p_vaga: d.vaga,
    p_onde: d.onde.trim() || null,
    p_link: link || null,
  });
  if (error) return { ok: false, erro: error.message };
  const r = (data ?? {}) as { ok?: boolean; mensagem?: string; erro?: string };
  if (!r.ok) return { ok: false, erro: r.erro ?? "Não entrou na fila." };
  refresh();
  return { ok: true, mensagem: r.mensagem };
}

export async function salvarTextoVagasEmailEmpresas(d: { assunto: string; texto: string }): Promise<Feito> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  if (!d.texto.includes("{vaga}") && !d.assunto.includes("{vaga}"))
    return { ok: false, erro: "Use {vaga} no assunto ou no texto: este e-mail cita a vaga que a empresa anunciou." };
  const { error } = await c.rpc("admin_email_empresas_vagas_salvar", { p_assunto: d.assunto, p_texto: d.texto });
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true, mensagem: "Salvo." };
}
