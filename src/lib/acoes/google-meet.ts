"use server";

import { refresh } from "next/cache";
import { emailValido } from "@/lib/email-valido";
import { criarReuniaoMeet, meetLigado, type ReuniaoMeet } from "@/lib/servidor/google-meet";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { ehAdminLocal } from "@/lib/supabase/admin";

const QUANDO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Até quantas pessoas o convite da conversa leva. */
const MAXIMO_DE_CONVIDADOS = 20;

/** Admin › E-mails › Agendar conversa: cria o evento com o Google Meet e, se pedido, convida as pessoas. */
export async function criarReuniaoDaConversa(p: {
  titulo: string;
  inicio: string;
  minutos: number;
  descricao: string;
  /** os e-mails que o Google convida (vazio: só o evento na agenda) */
  convidados: string[];
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
    !Array.isArray(p.convidados) ||
    p.convidados.length > MAXIMO_DE_CONVIDADOS ||
    p.convidados.some((e) => typeof e !== "string" || !emailValido(e))
  )
    return { ok: false, erro: "Confira o dia, a hora, a duração e os e-mails." };
  // o mesmo e-mail uma vez só (sem ligar para maiúsculas)
  const convidados = p.convidados
    .map((e) => e.trim())
    .filter((e, i, todos) => todos.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === i);
  try {
    const reuniao = await criarReuniaoMeet({ ...p, convidados });
    // a lista "Conversas na agenda" já mostra a nova
    refresh();
    return { ok: true, reuniao };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para criar a reunião no Google agora." };
  }
}
