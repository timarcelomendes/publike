import { MODO_DEMO } from "@/lib/config";
import { ETAPAS_FALHA, ONDES_FALHA, type EtapaFalha, type OndeFalha } from "@/lib/falhas";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Falhas que só o navegador vê ao publicar vaga e salvar currículo: o PDF ou a foto que não subiu,
// o salvar que não chegou ao servidor (site publicado de novo com a página aberta, internet caiu).
// O navegador manda por sendBeacon (relatarFalha em src/lib/falhas.ts); o banco registra e avisa a
// equipe (registrar_falha_cadastro). As do servidor são registradas lá mesmo (src/lib/servidor/falhas.ts).

function texto(v: unknown, max: number) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

export async function POST(request: Request) {
  if (MODO_DEMO) return new Response(null, { status: 204 });
  // 20 a cada 10 minutos por endereço de internet
  if (!dentroDoLimite(`falha:${embaralhar(await enderecoDeQuemPediu())}`, 20, 10 * 60_000)) {
    return new Response(null, { status: 429 });
  }
  let corpo: Record<string, unknown>;
  try {
    corpo = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const onde = corpo.onde as OndeFalha;
  const etapa = corpo.etapa as EtapaFalha;
  const mensagem = texto(corpo.mensagem, 500);
  if (!ONDES_FALHA.includes(onde) || !ETAPAS_FALHA.includes(etapa) || !mensagem) {
    return new Response(null, { status: 400 });
  }
  const pagina = texto(corpo.pagina, 300);
  const { error } = await (await criarClienteServidor()).rpc("registrar_falha_cadastro", {
    p_onde: onde,
    p_etapa: etapa,
    p_mensagem: mensagem,
    p_detalhe: texto(corpo.detalhe, 1000),
    p_pagina: pagina?.startsWith("/") ? pagina : undefined,
    p_navegador: request.headers.get("user-agent")?.slice(0, 300) ?? undefined,
  });
  if (error) console.warn(`Publike: não deu para registrar a falha do navegador: ${error.message}`);
  return new Response(null, { status: 204 });
}
