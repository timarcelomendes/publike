"use server";

import { criarReuniaoZoom, zoomLigado, type ReuniaoZoom } from "@/lib/servidor/zoom";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { ehAdminLocal } from "@/lib/supabase/admin";

const QUANDO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Admin › E-mails › Agendar conversa: cria a reunião no Zoom para o prospect. */
export async function criarReuniaoDaConversa(p: {
  titulo: string;
  inicio: string;
  minutos: number;
  pauta: string;
}): Promise<{ ok: true; reuniao: ReuniaoZoom } | { ok: false; erro: string }> {
  if (!(await ehAdminLocal()) && !(await possoVerTela("/admin/emails")))
    return { ok: false, erro: "Só a equipe do Publike cria reuniões." };
  if (!zoomLigado()) return { ok: false, erro: "O Zoom ainda não está ligado no servidor." };
  if (
    typeof p?.titulo !== "string" ||
    typeof p.pauta !== "string" ||
    !QUANDO.test(String(p.inicio)) ||
    !Number.isInteger(p.minutos) ||
    p.minutos < 10 ||
    p.minutos > 240
  )
    return { ok: false, erro: "Confira o dia, a hora e a duração." };
  try {
    return { ok: true, reuniao: await criarReuniaoZoom(p) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para criar a reunião no Zoom agora." };
  }
}
