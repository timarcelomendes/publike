"use server";

import { redirect } from "next/navigation";
import { avisarQuemAtende } from "@/lib/servidor/atendem-a-vaga";
import { avisarProcuradas } from "@/lib/servidor/filas";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";

// Admin › Procuradas sem vaga (migração 20270822120000): ligar o envio da semana, o mínimo de pessoas, os dias, e o
// "Mandar agora" (depois de ver a lista de quem recebe).

const AQUI = "/admin/procuradas";

export async function salvarConfigProcuradas(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const n = (k: string, min: number, max: number) => {
    const v = Math.floor(Number(formData.get(k)));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  };
  const { error } = await c.rpc("admin_procuradas_config", {
    p_ligado: formData.get("ligado") === "on",
    p_minimo: n("minimo", 1, 50),
    p_dias: n("dias", 1, 30),
  });
  redirect(`${AQUI}?${error ? "erro=salvar" : "salvo=procuradas"}`);
}

export async function mandarProcuradasAgora() {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const r = await avisarProcuradas(true);
  redirect(`${AQUI}?${r.motivo ? "erro=mandar" : `mandados=${r.avisos}`}`);
}

// Quem atende a vaga e não curtiu (migração 20270908120000): ligar, quantas pessoas novas juntam um aviso, e o "Mandar
// agora" (fora do horário e com o envio desligado; continua um por dia por vaga)

export async function salvarConfigAtendem(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const v = Math.floor(Number(formData.get("minimo")));
  const { error } = await c.rpc("admin_atendem_config", {
    p_ligado: formData.get("ligado") === "on",
    p_minimo: Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : null,
  });
  redirect(`${AQUI}?aba=atendem&${error ? "erro=salvar" : "salvo=atendem"}`);
}

export async function mandarAtendemAgora() {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const r = await avisarQuemAtende(true);
  redirect(`${AQUI}?aba=atendem&${r.motivo ? "erro=mandar" : `atendem=${r.avisos}`}`);
}

// O aviso de vaga nova pelo WhatsApp (migração 20271005120000): o teto do dia (0 para de mandar). Ligar e desligar
// fica em Admin › WhatsApp › Parâmetros, com os outros avisos.

export async function salvarAvisosDeVaga(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?aba=aviso&erro=fora`);
  const v = Math.floor(Number(formData.get("por_dia")));
  if (!Number.isFinite(v) || v < 0 || v > 5000) redirect(`${AQUI}?aba=aviso&erro=teto`);
  // o freio (migração 20271006120000): o % de quem pede para parar que faz o aviso parar sozinho
  const bruto = formData.get("freio_pct");
  const freio = bruto == null || bruto === "" ? null : Math.floor(Number(bruto));
  if (freio !== null && (!Number.isFinite(freio) || freio < 1 || freio > 50)) redirect(`${AQUI}?aba=aviso&erro=freio`);
  const { error } = await c.rpc("admin_salvar_avisos_de_vaga_whatsapp", {
    p_por_dia: v,
    ...(freio !== null ? { p_freio_pct: freio } : {}),
  });
  redirect(`${AQUI}?aba=aviso&${error ? "erro=salvar" : "salvo=aviso"}`);
}

/** Solta o freio do aviso de vaga nova: as contas recomeçam de agora (migração 20271006120000). */
export async function religarAvisosDeVaga() {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?aba=aviso&erro=fora`);
  const { error } = await c.rpc("admin_religar_avisos_de_vaga_whatsapp");
  redirect(`${AQUI}?aba=aviso&${error ? "erro=salvar" : "salvo=religado"}`);
}
