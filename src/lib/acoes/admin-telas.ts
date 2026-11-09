"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

const ROTA = /^\/admin(\/[a-z0-9-]+)*$/;

/** O cliente de quem muda as marcas: o admin do computador do dono ou a equipe publike.org no site. */
async function clienteDasTelas() {
  if (await ehAdminLocal()) return criarClienteAdmin();
  if (await possoVerTela("/admin/telas")) return criarClienteServidor();
  return null;
}

/** Marca ou desmarca "Somente publike.org" numa tela do Admin. O banco confere de novo quem pede. */
export async function marcarTela(rota: string, somente: boolean): Promise<Resultado> {
  if (typeof rota !== "string" || !ROTA.test(rota) || typeof somente !== "boolean")
    return { ok: false, erro: "Pedido inválido." };
  const c = await clienteDasTelas();
  if (!c) return { ok: false, erro: "Só a equipe do Publike muda quem vê as telas." };
  const { error } = await c.rpc("admin_marcar_tela", { p_rota: rota, p_somente: somente });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: somente ? "Agora só a equipe publike.org vê." : "Agora o moderador também vê." };
}
