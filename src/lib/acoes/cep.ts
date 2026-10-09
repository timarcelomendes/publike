"use server";

import { headers } from "next/headers";
import type { ConsultaCep } from "@/lib/cep";
import { consultarCep } from "@/lib/servidor/cep";

// Quem não entrou também pode usar o CEP ("Onde você mora?"). Para ninguém
// usar o Publike como consulta de CEP em massa: no máximo 20 por minuto por
// endereço de internet.
const USOS = new Map<string, number[]>();

async function podeConsultar() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
  const agora = Date.now();
  const recentes = (USOS.get(ip) ?? []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 20) return false;
  recentes.push(agora);
  if (USOS.size > 5000) USOS.clear();
  USOS.set(ip, recentes);
  return true;
}

/** Endereço e ponto no mapa de um CEP de Goiânia e região (com o número, a porta). */
export async function buscarCep(cep: string, numero?: string | null): Promise<ConsultaCep> {
  if (typeof cep !== "string") return { ok: false, motivo: "invalido", erro: "O CEP tem 8 números." };
  if (!(await podeConsultar())) {
    return { ok: false, motivo: "indisponivel", erro: "Muitas consultas seguidas. Espere um minuto e tente de novo." };
  }
  return consultarCep(cep.slice(0, 12), typeof numero === "string" ? numero.slice(0, 12) : null);
}
