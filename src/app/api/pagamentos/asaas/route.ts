import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { tokenDoWebhook } from "@/lib/servidor/asaas";
import { enviarPushPendentes } from "@/lib/servidor/filas";
import { processarEvento } from "@/lib/servidor/pagamentos";

// Os avisos do Asaas (o "webhook", cadastrado no painel do Asaas com o token de ASAAS_WEBHOOK_TOKEN). O aviso
// só diz o que olhar: a cobrança, a assinatura e a nota são sempre lidas de novo na API do Asaas. Erro: 500,
// e o Asaas manda de novo (o mesmo aviso não é gravado duas vezes).
export const maxDuration = 60;

function autorizado(veio: string | null) {
  const token = tokenDoWebhook();
  if (token.length < 16 || !veio) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(veio);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorizado(request.headers.get("asaas-access-token"))) {
    return Response.json({ ok: false }, { status: 401 });
  }
  let evento: unknown;
  try {
    evento = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!evento || typeof evento !== "object") return Response.json({ ok: false }, { status: 400 });
  let erro: string | null;
  try {
    erro = await processarEvento(evento as Parameters<typeof processarEvento>[0]);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("Publike: aviso de pagamento sem processar:", erro.slice(0, 300));
  }
  // os avisos de pagamento no celular
  after(() => enviarPushPendentes());
  return erro ? Response.json({ ok: false }, { status: 500 }) : Response.json({ ok: true });
}
