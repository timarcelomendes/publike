import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { paginaValida } from "@/lib/tempo-na-pagina";
import { lerAvisoDeVelocidade } from "@/lib/velocidade";

// A velocidade de verdade (migração 20270709120000; src/lib/velocidade-cliente.ts): o navegador avisa as medidas da
// página aberta (navigator.sendBeacon). O banco confere tudo de novo e guarda sem saber quem (`registrar_velocidade`).

// a mesma lista do /api/tempo (robôs não contam)
const ROBO =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;

export async function POST(request: Request) {
  if (MODO_DEMO || ROBO.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  // só o próprio site avisa
  const de = request.headers.get("sec-fetch-site");
  if (de && de !== "same-origin") return new Response(null, { status: 204 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const aviso = lerAvisoDeVelocidade(corpo);
  if (!aviso || !paginaValida(aviso.p)) return new Response(null, { status: 400 });
  const { error } = await criarClientePublico().rpc("registrar_velocidade", {
    p_visita: aviso.i,
    p_pagina: aviso.p,
    p_celular: aviso.c,
    p_conexao: aviso.k ?? null,
    p_navegacao: aviso.t ?? null,
    p_medidas: aviso.m as never,
  });
  // sem a migração 20270709120000, o banco ainda não tem a função: só não guarda
  if (error && error.code !== "PGRST202") {
    console.error(`Publike: não deu para guardar a velocidade: ${error.message}`);
  }
  return new Response(null, { status: 204 });
}
