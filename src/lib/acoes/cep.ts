"use server";

import { headers } from "next/headers";
import type { ConsultaCep, ConsultaPontoDoFormulario } from "@/lib/cep";
import { distanciaKm } from "@/lib/descobrir";
import { chaveBairro } from "@/lib/regioes";
import { centroDoBairro, consultarCep, enderecoDoPonto } from "@/lib/servidor/cep";

// Bairro escrito a até esta distância do ponto: confere. Os bairros de Goiânia têm
// de 1 a 3 km, e o "meio" que o mapa dá para um bairro é aproximado.
const BAIRRO_PERTO_KM = 2;

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

/**
 * O endereço do ponto marcado no mapa ou pela localização do aparelho (rua, bairro,
 * cidade e, se houver, o CEP). Com o bairro que a pessoa já escreveu, diz também se
 * ele confere com o ponto: o nome do mapa nem sempre é o que o povo usa (no mapa, o
 * Moinho dos Ventos fica dentro do "Jardim Presidente"), então um bairro escrito
 * que fica perto do ponto não é trocado.
 */
export async function buscarEnderecoDoPonto(
  lat: number,
  lng: number,
  bairroEscrito?: string | null,
): Promise<ConsultaPontoDoFormulario> {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, erro: "Ponto inválido." };
  }
  if (!(await podeConsultar())) {
    return { ok: false, erro: "Muitas consultas seguidas. Espere um minuto e tente de novo." };
  }
  const r = await enderecoDoPonto(lat, lng);
  if (!r.ok) return r;
  const escrito = typeof bairroEscrito === "string" ? bairroEscrito.trim().slice(0, 80) : "";
  let manterBairro = false;
  if (escrito) {
    if (r.endereco.bairro && chaveBairro(escrito) === chaveBairro(r.endereco.bairro)) {
      manterBairro = true;
    } else {
      const centro = await centroDoBairro(escrito, r.endereco.cidade).catch(() => null);
      manterBairro = centro !== null && distanciaKm(centro.lat, centro.lng, lat, lng) <= BAIRRO_PERTO_KM;
    }
  }
  return { ...r, manterBairro };
}
