"use server";

import { emailValido } from "@/lib/email-valido";
import { criarReuniaoMeet, meetLigado, type ReuniaoMeet } from "@/lib/servidor/google-meet";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { ehAdminLocal } from "@/lib/supabase/admin";

const QUANDO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Admin › E-mails › Agendar conversa: cria o evento com o Google Meet e, se pedido, convida o prospect. */
export async function criarReuniaoDaConversa(p: {
  titulo: string;
  inicio: string;
  minutos: number;
  descricao: string;
  convidado: string | null;
}): Promise<{ ok: true; reuniao: ReuniaoMeet } | { ok: false; erro: string }> {
  if (!(await ehAdminLocal()) && !(await possoVerTela("/admin/emails")))
    return { ok: false, erro: "Só a equipe do Publike cria reuniões." };
  if (!meetLigado()) return { ok: false, erro: "O Google Meet ainda não está ligado no servidor." };
  if (
    typeof p?.titulo !== "string" ||
    typeof p.descricao !== "string" ||
    !QUANDO.test(String(p.inicio)) ||
    !Number.isInteger(p.minutos) ||
    p.minutos < 10 ||
    p.minutos > 240 ||
    (p.convidado !== null && (typeof p.convidado !== "string" || !emailValido(p.convidado)))
  )
    return { ok: false, erro: "Confira o dia, a hora, a duração e o e-mail." };
  try {
    return { ok: true, reuniao: await criarReuniaoMeet({ ...p, convidado: p.convidado?.trim() || null }) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para criar a reunião no Google agora." };
  }
}
