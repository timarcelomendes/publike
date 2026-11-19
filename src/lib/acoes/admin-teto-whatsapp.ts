"use server";

import { refresh } from "next/cache";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// O teto do mês do atendimento do WhatsApp (migração 20270808120000): no computador do dono e, no site no ar, para a
// equipe publike.org.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
}

export async function salvarTetoWhatsapp(teto: number | string): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const n = Math.round(Number(String(teto).replace(/\D/g, "")));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, erro: "O teto vai de 0 (sem teto) a 1.000.000." };
  const { error } = await c.rpc("admin_salvar_teto_whatsapp", { p_teto: n });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Falta rodar a migração 20270808120000 no banco." };
    return { ok: false, erro: error.message || "Não deu para salvar agora." };
  }
  refresh();
  return { ok: true, mensagem: n ? "Salvo. Vale para a próxima mensagem que chegar." : "Salvo: sem teto." };
}
