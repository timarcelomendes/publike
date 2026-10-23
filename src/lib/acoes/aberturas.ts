"use server";

import { headers } from "next/headers";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Robôs que rodam o JavaScript da página também ficam de fora (a mesma lista do contador do site).
const ROBO =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;

/**
 * Alguém abriu um anúncio: conta para a ordem "Mais relevantes". O banco guarda só um código do dia
 * (o IP e o navegador misturados com o sorteio do dia, apagado no dia seguinte), uma vez por pessoa
 * por dia, e não conta quem publicou. Chamada pelo navegador depois que a página aparece.
 */
export async function contarAbertura(anuncioId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return;
  const h = await headers();
  const navegador = h.get("user-agent") ?? "";
  if (ROBO.test(navegador)) return;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (!ip) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("contar_abertura", { p_anuncio: anuncioId, p_ip: ip, p_navegador: navegador });
  // sem a migração (ou com o banco fora), a página segue sem contar
  if (error && error.code !== "PGRST202") console.error(`Publike: falha ao contar a abertura: ${error.message}`);
}
