"use server";

import type { ConsultaCnpj } from "@/lib/cnpj";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { consultarCnpj } from "@/lib/servidor/brasilapi";

/** Busca os dados públicos do CNPJ para preencher o perfil. Só para quem está logado. */
export async function buscarDadosCnpj(cnpj: string): Promise<ConsultaCnpj> {
  if (MODO_DEMO || typeof cnpj !== "string") return { ok: false, motivo: "indisponivel" };
  if (!(await obterUsuario())) return { ok: false, motivo: "indisponivel" };
  return consultarCnpj(cnpj.slice(0, 30));
}
