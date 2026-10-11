"use server";

import { headers } from "next/headers";
import type { ConsultaCep, ConsultaPonto } from "@/lib/cep";
import { consultarCep, enderecoDoPonto } from "@/lib/servidor/cep";

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

/** O endereço do ponto marcado pela localização do aparelho (rua, bairro, cidade e, se houver, o CEP). */
export async function buscarEnderecoDoPonto(lat: number, lng: number): Promise<ConsultaPonto> {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, erro: "Ponto inválido." };
  }
  if (!(await podeConsultar())) {
    return { ok: false, erro: "Muitas consultas seguidas. Espere um minuto e tente de novo." };
  }
  return enderecoDoPonto(lat, lng);
}
