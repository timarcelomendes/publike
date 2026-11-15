"use server";

import { refresh } from "next/cache";
import { prepararMateriasDoMes } from "@/lib/servidor/materias-receita";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

/** Admin › Base da Receita: as duas matérias do mês viram rascunho em Admin › Notícias. */
export async function prepararMaterias(mes?: string | null): Promise<Resultado> {
  const admin = await clienteAdminOuNulo();
  const c = admin ?? ((await possoVerTela("/admin/receita")) ? await criarClienteServidor() : null);
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const r = await prepararMateriasDoMes(c, mes && /^\d{4}-\d{2}-01$/.test(mes) ? mes : null);
  if (!r.ok) return { ok: false, erro: r.erro };
  refresh();
  return {
    ok: true,
    mensagem: r.novas
      ? `${r.novas === 1 ? "1 rascunho entrou" : `${r.novas} rascunhos entraram`} em Admin › Notícias. Revise antes de aprovar.`
      : "Os rascunhos deste mês já estavam em Admin › Notícias.",
  };
}
