"use server";

import { redirect } from "next/navigation";
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
  redirect(`${AQUI}?${error ? "erro=salvar" : "salvo=1"}`);
}

export async function mandarProcuradasAgora() {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const r = await avisarProcuradas(true);
  redirect(`${AQUI}?${r.motivo ? "erro=mandar" : `mandados=${r.avisos}`}`);
}
