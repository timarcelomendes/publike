"use server";

import { refresh } from "next/cache";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Admin › WhatsApp › Conversas: o convite do Instagram (migração 20270911120000).

type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

export async function salvarConviteInstagram(ligado: boolean, minutos: number | string): Promise<Resultado> {
  const c = (await clienteAdminOuNulo()) ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const n = Math.round(Number(String(minutos).replace(/\D/g, "")));
  if (!Number.isFinite(n) || n < 10 || n > 600) return { ok: false, erro: "Os minutos vão de 10 a 600." };
  const { error } = await c.rpc("admin_salvar_instagram_whatsapp", { p_ligado: ligado, p_minutos: n });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Falta rodar a migração 20270911120000 no banco." };
    return { ok: false, erro: error.message || "Não deu para salvar agora." };
  }
  refresh();
  return { ok: true, mensagem: ligado ? `Salvo: o convite sai ${n} minutos depois das vagas.` : "Salvo: o convite está desligado." };
}
