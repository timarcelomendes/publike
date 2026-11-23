"use server";

import { refresh } from "next/cache";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Admin › Publicar pelo WhatsApp: publicar a vaga aqui mesmo, com o "Sim, publicar" (migração 20270914120000).

type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

export async function salvarPublicarAqui(ligado: boolean): Promise<Resultado> {
  const c =
    (await clienteAdminOuNulo()) ??
    ((await possoVerTela("/admin/publicar-pelo-whatsapp")) ? await criarClienteServidor() : null);
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const { error } = await c.rpc("admin_salvar_whatsapp_publicar_aqui", { p_ligado: Boolean(ligado) });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Falta rodar a migração 20270914120000 no banco." };
    return { ok: false, erro: error.message || "Não deu para salvar agora." };
  }
  refresh();
  return {
    ok: true,
    mensagem: ligado ? "Salvo: a vaga sai pelo “Sim, publicar”, na conversa." : "Salvo: a vaga volta a ir pelo link do site.",
  };
}
