import { after } from "next/server";
import { assinaturaValida, tokenDoWebhookValido, tratarAvisoDaMeta, type AvisoDaMeta } from "@/lib/servidor/whatsapp";

// O webhook do WhatsApp oficial (claude/plano-whatsapp-oficial.md; cadastrado no app da Meta com o endereço
// /api/whatsapp/webhook, o token de WHATSAPP_WEBHOOK_TOKEN e o campo "messages").
//   GET: a Meta confere o endereço (hub.verify_token) e espera o hub.challenge de volta.
//   POST: a entrega e a leitura dos avisos, os botões de resposta rápida e o PARAR. Só com a assinatura certa
//   (X-Hub-Signature-256, com WHATSAPP_APP_SECRET). Erro: 500, e a Meta manda de novo (o banco não repete nada).
//   Com o atendimento ligado (migração 20270801120000), a conversa com a IA roda em after(), dentro do maxDuration.
export const maxDuration = 60;

export async function GET(request: Request) {
  const u = new URL(request.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && tokenDoWebhookValido(u.searchParams.get("hub.verify_token"))) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // Para quem configura (16/11/2026): abrir o endereço no navegador diz o que falta, sem mostrar o token.
  const configurado = (process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim().length >= 12;
  const texto = !configurado
    ? "O site ainda não tem o WHATSAPP_WEBHOOK_TOKEN (12 letras ou mais). Crie na Vercel em Production e faça um Redeploy."
    : u.searchParams.has("hub.verify_token")
      ? "O token não bate com o WHATSAPP_WEBHOOK_TOKEN da Vercel."
      : "Webhook do WhatsApp no ar. O WHATSAPP_WEBHOOK_TOKEN está configurado; use o mesmo valor em Verificar token, na Meta.";
  return new Response(texto, {
    status: configurado && !u.searchParams.has("hub.verify_token") ? 200 : 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const corpo = await request.text();
  const segredo = (process.env.WHATSAPP_APP_SECRET || "").trim();
  if (!segredo) return Response.json({ ok: false, erro: "Falta o WHATSAPP_APP_SECRET." }, { status: 503 });
  if (!assinaturaValida(corpo, request.headers.get("x-hub-signature-256"), segredo)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  let aviso: AvisoDaMeta;
  try {
    aviso = JSON.parse(corpo) as AvisoDaMeta;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (aviso?.object !== "whatsapp_business_account") return Response.json({ ok: true, ignorado: true });
  try {
    const r = await tratarAvisoDaMeta(aviso);
    // o atendimento (a IA responde a conversa) roda depois do 200: a Meta espera a resposta rápida
    if (r.depois.length)
      // juntas: duas mensagens seguidas da mesma pessoa no mesmo aviso esperam ao mesmo tempo, e só a mais nova responde
      after(() =>
        Promise.all(
          r.depois.map((atender) =>
            atender().catch((e) =>
              console.error("Publike: o atendimento do WhatsApp falhou:", e instanceof Error ? e.message.slice(0, 300) : e),
            ),
          ),
        ),
      );
    return Response.json({ ok: true, tratados: r.tratados });
  } catch (e) {
    console.error("Publike: aviso do WhatsApp sem tratar:", e instanceof Error ? e.message.slice(0, 300) : e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
